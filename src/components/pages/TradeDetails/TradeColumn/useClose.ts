import { defaultAbiCoder } from "@ethersproject/abi";
import { getAddress } from "@ethersproject/address";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import type { CurrencyAmount } from "@uniswap/sdk-core";
import { useMemo } from "react";
import type { Address, usePrepareContractWrite } from "wagmi";
import { useAccount } from "wagmi";

import { useEnvironment } from "../../../../contexts/environment2";
import { useSettings } from "../../../../contexts/settings";
import {
  useLendgineRouter,
  useLendgineRouterBurn,
  useLendgineRouterMulticall,
  usePrepareLendgineRouterBurn,
  usePrepareLendgineRouterMulticall,
} from "../../../../generated";
import { useApprove } from "../../../../hooks/useApproval";
import type { HookArg } from "../../../../hooks/useBalance";
import { useBalance } from "../../../../hooks/useBalance";
import {
  isV3,
  useMostLiquidMarket,
} from "../../../../hooks/useExternalExchange";
import { useLendgine } from "../../../../hooks/useLendgine";
import type { WrappedTokenInfo } from "../../../../hooks/useTokens2";
import type { BeetStage } from "../../../../utils/beet";
import {
  accruedLendgineInfo,
  getT,
  liquidityPerShare,
} from "../../../../utils/Numoen/lendgineMath";
import { priceToFraction } from "../../../../utils/Numoen/price";
import { ONE_HUNDRED_PERCENT, scale } from "../../../../utils/Numoen/trade";
import { usePositionValue, useTradeDetails } from "../TradeDetailsInner";

export const useClose = ({
  amountOut,
}: {
  amountOut: HookArg<CurrencyAmount<WrappedTokenInfo>>;
}) => {
  const { address } = useAccount();
  const environment = useEnvironment();
  const settings = useSettings();

  const { selectedLendgine, base, quote } = useTradeDetails();
  const mostLiquid = useMostLiquidMarket([base, quote]);
  const { shares, amount0, amount1 } = useCloseAmounts({ amountOut });

  const approve = useApprove(shares, environment.base.lendgineRouter);

  const lendgineRouterContract = useLendgineRouter({
    address: environment.base.lendgineRouter,
  });

  const { args, native, unwrapArgs } = useMemo(() => {
    if (
      !shares ||
      !amount0 ||
      !amount1 ||
      !amountOut ||
      !mostLiquid.data ||
      !address
    )
      return {};

    const native = environment.interface.wrappedNative.equals(
      amountOut.currency
    );
    const args = [
      {
        token0: getAddress(selectedLendgine.token0.address),
        token1: getAddress(selectedLendgine.token1.address),
        token0Exp: BigNumber.from(selectedLendgine.token0.decimals),
        token1Exp: BigNumber.from(selectedLendgine.token1.decimals),
        upperBound: BigNumber.from(
          priceToFraction(selectedLendgine.bound)
            .multiply(scale)
            .quotient.toString()
        ),
        shares: BigNumber.from(shares.quotient.toString()),
        collateralMin: BigNumber.from(
          amountOut
            .multiply(ONE_HUNDRED_PERCENT.subtract(settings.maxSlippagePercent))
            .quotient.toString()
        ),
        amount0Min: BigNumber.from(
          amount0
            .multiply(ONE_HUNDRED_PERCENT.subtract(settings.maxSlippagePercent))
            .quotient.toString()
        ),
        amount1Min: BigNumber.from(
          amount1
            .multiply(ONE_HUNDRED_PERCENT.subtract(settings.maxSlippagePercent))
            .quotient.toString()
        ),
        swapType: isV3(mostLiquid.data.pool) ? 1 : 0,
        swapExtraData: isV3(mostLiquid.data.pool)
          ? (defaultAbiCoder.encode(
              ["tuple(uint24 fee)"],
              [
                {
                  fee: mostLiquid.data.pool.feeTier,
                },
              ]
            ) as Address)
          : AddressZero,
        recipient: native ? AddressZero : address,
        deadline: BigNumber.from(
          Math.round(Date.now() / 1000) + settings.timeout * 60
        ),
      },
    ] as const;

    const unwrapArgs = [
      BigNumber.from(
        amountOut
          .multiply(ONE_HUNDRED_PERCENT.subtract(settings.maxSlippagePercent))
          .quotient.toString()
      ),
      address,
    ] as const;

    return { args, native, unwrapArgs };
  }, [
    address,
    amount0,
    amount1,
    amountOut,
    environment.interface.wrappedNative,
    mostLiquid.data,
    selectedLendgine.bound,
    selectedLendgine.token0.address,
    selectedLendgine.token0.decimals,
    selectedLendgine.token1.address,
    selectedLendgine.token1.decimals,
    settings.maxSlippagePercent,
    settings.timeout,
    shares,
  ]);

  const prepareBurn = usePrepareLendgineRouterBurn({
    enabled: !!args,
    address: environment.base.lendgineRouter,
    args: args,
    staleTime: Infinity,
  });
  const sendBurn = useLendgineRouterBurn(prepareBurn.config);

  const prepareMulticall = usePrepareLendgineRouterMulticall({
    enabled:
      !!prepareBurn.config.request && !!native && !!lendgineRouterContract,
    staleTime: Infinity,
    address: environment.base.lendgineRouter,
    args:
      prepareBurn.config.request &&
      prepareBurn.config.request.data &&
      lendgineRouterContract
        ? [
            [
              prepareBurn.config.request.data,
              lendgineRouterContract.interface.encodeFunctionData(
                "unwrapWETH",
                unwrapArgs
              ),
            ] as `0x${string}`[],
          ]
        : undefined,
  });
  // TODO: wagmi should infer data as 0x and has mistyped prepare.config type
  const sendMulticall = useLendgineRouterMulticall(prepareMulticall.config);

  return useMemo(
    () =>
      [
        approve.beetStage,
        native
          ? {
              stageTitle: `Sell ${selectedLendgine.token1.symbol}+`,
              parallelTransactions: [
                {
                  title: `Sell ${selectedLendgine.token1.symbol}+`,
                  tx: {
                    prepare: prepareMulticall as ReturnType<
                      typeof usePrepareContractWrite
                    >,
                    send: sendMulticall,
                  },
                },
              ],
            }
          : {
              stageTitle: `Sell ${selectedLendgine.token1.symbol}+`,
              parallelTransactions: [
                {
                  title: `Sell ${selectedLendgine.token1.symbol}+`,
                  tx: {
                    prepare: prepareBurn as ReturnType<
                      typeof usePrepareContractWrite
                    >,
                    send: sendBurn,
                  },
                },
              ],
            },
      ].filter((s) => !!s) as BeetStage[],
    [
      approve.beetStage,
      native,
      prepareBurn,
      prepareMulticall,
      selectedLendgine.token1.symbol,
      sendBurn,
      sendMulticall,
    ]
  );
};

export const useCloseAmounts = ({
  amountOut,
}: {
  amountOut: HookArg<CurrencyAmount<WrappedTokenInfo>>;
}) => {
  const { selectedLendgine } = useTradeDetails();
  const { address } = useAccount();

  const lendgineInfoQuery = useLendgine(selectedLendgine);
  const balanceQuery = useBalance(selectedLendgine.lendgine, address);
  const positionValue = usePositionValue(selectedLendgine);

  const t = getT();

  return useMemo(() => {
    if (
      !lendgineInfoQuery.data ||
      !balanceQuery.data ||
      !amountOut ||
      !positionValue
    )
      return {};

    const updateLendgineInfo = accruedLendgineInfo(
      selectedLendgine,
      lendgineInfoQuery.data,
      t
    );
    const shares = balanceQuery.data.multiply(amountOut).divide(positionValue);

    const liquidityMinted = liquidityPerShare(
      selectedLendgine,
      updateLendgineInfo
    ).quote(shares);

    const amount0 = updateLendgineInfo.reserve0
      .multiply(liquidityMinted)
      .divide(updateLendgineInfo.totalLiquidity);

    const amount1 = updateLendgineInfo.reserve1
      .multiply(liquidityMinted)
      .divide(updateLendgineInfo.totalLiquidity);

    return { shares, liquidityMinted, amount0, amount1 };
  }, [
    amountOut,
    balanceQuery.data,
    lendgineInfoQuery.data,
    positionValue,
    selectedLendgine,
    t,
  ]);
};