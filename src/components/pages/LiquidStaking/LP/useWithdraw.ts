import { useMutation } from "@tanstack/react-query";
import type { CurrencyAmount, Token } from "@uniswap/sdk-core";
import type { Address } from "abitype";
import { BigNumber, constants, utils } from "ethers";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import {
  getContract,
  prepareWriteContract,
  writeContract,
} from "wagmi/actions";

import { accruedLendgineInfo } from "./math";
import { toaster } from "../../../../AppWithProviders";
import { liquidityManagerABI } from "../../../../abis/liquidityManager";
import { useSettings } from "../../../../contexts/settings";
import { useEnvironment } from "../../../../contexts/useEnvironment";
import type { HookArg } from "../../../../hooks/internal/types";
import { useInvalidateCall } from "../../../../hooks/internal/useInvalidateCall";
import { useAwaitTX } from "../../../../hooks/useAwaitTX";
import { getBalanceRead } from "../../../../hooks/useBalance";
import { useLendgine } from "../../../../hooks/useLendgine";
import {
  getLendginePositionRead,
  useLendginePosition,
} from "../../../../hooks/useLendginePosition";
import { useIsWrappedNative } from "../../../../hooks/useTokens";
import { ONE_HUNDRED_PERCENT, scale } from "../../../../lib/constants";
import { getT, liquidityPerPosition } from "../../../../lib/lendgineMath";
import { priceToFraction } from "../../../../lib/price";
import type {
  Lendgine,
  LendginePosition,
} from "../../../../lib/types/lendgine";
import type { WrappedTokenInfo } from "../../../../lib/types/wrappedTokenInfo";
import type { BeetStage, TxToast } from "../../../../utils/beet";

export const useWithdraw = ({
  size,
  amount0,
  amount1,
}: {
  size: HookArg<CurrencyAmount<Token>>;
  amount0: HookArg<CurrencyAmount<WrappedTokenInfo>>;
  amount1: HookArg<CurrencyAmount<WrappedTokenInfo>>;
}) => {
  const environment = useEnvironment();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const base = environment.interface.liquidStaking!.base;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const lendgine = environment.interface.liquidStaking!.lendgine;

  const settings = useSettings();
  const { address } = useAccount();
  const awaitTX = useAwaitTX();
  const invalidate = useInvalidateCall();

  const native0 = useIsWrappedNative(lendgine.token0);
  const native1 = useIsWrappedNative(lendgine.token1);

  const title = useMemo(
    () =>
      `Remove ${lendgine.token0.symbol} / ${lendgine.token1.symbol} liquidty`,
    [lendgine.token0.symbol, lendgine.token1.symbol]
  );

  const mutation = useMutation({
    mutationFn: async ({
      amount0,
      amount1,
      size,
      address,
      toast,
    }: {
      amount0: CurrencyAmount<Lendgine["token0"]>;
      amount1: CurrencyAmount<Lendgine["token1"]>;
      size: LendginePosition<Lendgine>["size"];
      address: Address;
    } & { toast: TxToast }) => {
      const args = [
        {
          token0: utils.getAddress(lendgine.token0.address),
          token1: utils.getAddress(lendgine.token1.address),
          token0Exp: BigNumber.from(lendgine.token0.decimals),
          token1Exp: BigNumber.from(lendgine.token1.decimals),
          upperBound: BigNumber.from(
            priceToFraction(lendgine.bound).multiply(scale).quotient.toString()
          ),
          amount0Min: BigNumber.from(
            amount0
              .multiply(
                ONE_HUNDRED_PERCENT.subtract(settings.maxSlippagePercent)
              )
              .quotient.toString()
          ),
          amount1Min: BigNumber.from(
            amount1
              .multiply(
                ONE_HUNDRED_PERCENT.subtract(settings.maxSlippagePercent)
              )
              .quotient.toString()
          ),
          size: BigNumber.from(size.quotient.toString()),

          recipient: native0 || native1 ? constants.AddressZero : address,
          deadline: BigNumber.from(
            Math.round(Date.now() / 1000) + settings.timeout * 60
          ),
        },
      ] as const;
      const unwrapArgs = [BigNumber.from(0), address] as const; // safe to be zero because the withdraw estimation will fail
      const sweepArgs = [
        native0 ? lendgine.token1.address : lendgine.token0.address,
        BigNumber.from(0),
        address,
      ] as const; // safe to be zero because the withdraw estimation will fail

      const liquidityManagerContract = getContract({
        abi: liquidityManagerABI,
        address: base.liquidityManager,
      });

      const tx =
        native0 || native1
          ? async () => {
              const config = await prepareWriteContract({
                abi: liquidityManagerABI,
                functionName: "multicall",
                address: base.liquidityManager,
                args: [
                  [
                    liquidityManagerContract.interface.encodeFunctionData(
                      "removeLiquidity",
                      args
                    ),
                    liquidityManagerContract.interface.encodeFunctionData(
                      "unwrapWETH",
                      unwrapArgs
                    ),
                    liquidityManagerContract.interface.encodeFunctionData(
                      "sweepToken",
                      sweepArgs
                    ),
                  ] as `0x${string}`[],
                ],
              });
              const data = await writeContract(config);
              return data;
            }
          : async () => {
              const config = await prepareWriteContract({
                abi: liquidityManagerABI,
                functionName: "removeLiquidity",
                address: base.liquidityManager,
                args,
              });
              const data = await writeContract(config);
              return data;
            };

      const transaction = await tx();
      toaster.txPending({
        ...toast,
        hash: transaction.hash,
      });

      return await awaitTX(transaction);
    },
    onMutate: ({ toast }) => toaster.txSending(toast),
    onError: (_, { toast }) => toaster.txError(toast),
    onSuccess: async (data, input) => {
      toaster.txSuccess({ ...input.toast, receipt: data });
      await Promise.all([
        invalidate(
          getLendginePositionRead(
            lendgine,
            input.address,
            base.liquidityManager
          )
        ),
        invalidate(getBalanceRead(input.amount0.currency, input.address)),
        invalidate(getBalanceRead(input.amount1.currency, input.address)),
      ]);
    },
  });

  return useMemo(() => {
    if (!size || !address || !amount0 || !amount1)
      return { status: "error" } as const;

    return {
      status: "success",
      data: [
        {
          title,
          parallelTxs: [
            {
              title,
              description: title,
              callback: (toast: TxToast) =>
                mutation.mutateAsync({
                  amount0,
                  amount1,
                  size,
                  address,
                  toast,
                }),
            },
          ],
        },
      ],
    } as const satisfies { data: readonly BeetStage[]; status: "success" };
  }, [address, amount0, amount1, mutation, size, title]);
};

export const useWithdrawAmounts = ({
  withdrawPercent,
}: {
  withdrawPercent: HookArg<number>;
}) => {
  const environment = useEnvironment();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const lendgine = environment.interface.liquidStaking!.lendgine;
  const { address } = useAccount();
  const position = useLendginePosition(
    lendgine,
    address,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    environment.interface.liquidStaking!.base.liquidityManager
  );
  const lendgineInfoQuery = useLendgine(lendgine);
  const t = getT();

  return useMemo(() => {
    if (!position.data || !withdrawPercent || !lendgineInfoQuery.data)
      return {};

    const size = position.data.size.multiply(withdrawPercent).divide(100);
    const updatedLendgineInfo = accruedLendgineInfo(
      lendgine,
      lendgineInfoQuery.data,
      t
    );

    const liqPerPosition = liquidityPerPosition(lendgine, updatedLendgineInfo);
    const liquidity = liqPerPosition.quote(size);

    const amount0 = updatedLendgineInfo.reserve0
      .multiply(liquidity)
      .divide(updatedLendgineInfo.totalLiquidity);

    const amount1 = updatedLendgineInfo.reserve1
      .multiply(liquidity)
      .divide(updatedLendgineInfo.totalLiquidity);

    return { size, liquidity, amount0, amount1 };
  }, [lendgineInfoQuery.data, position.data, lendgine, t, withdrawPercent]);
};
