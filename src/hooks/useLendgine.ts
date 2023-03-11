import type { BigNumber } from "@ethersproject/bignumber";
import { useQuery } from "@tanstack/react-query";
import { CurrencyAmount, Fraction, Token } from "@uniswap/sdk-core";
import JSBI from "jsbi";
import { chunk } from "lodash";
import { useCallback, useMemo } from "react";
import invariant from "tiny-invariant";
import type { Address } from "wagmi";
import { useContractReads } from "wagmi";

import type {
  Lendgine,
  LendgineInfo,
  LendginePosition,
} from "../constants/types";
import { useEnvironment } from "../contexts/environment2";
import {
  lendgineABI,
  liquidityManagerABI,
  useLiquidityManagerPositions,
} from "../generated";
import { LendginesDocument } from "../gql/numoen/graphql";
import type { RawLendgine } from "../services/graphql/numoen";
import { parseLendgines } from "../services/graphql/numoen";
import { fractionToPrice } from "../utils/Numoen/price";
import { scale } from "../utils/Numoen/trade";
import type { Tuple } from "../utils/readonlyTuple";
import type { HookArg } from "./useBalance";
import { useChain } from "./useChain";
import { useClient } from "./useClient";
import { isValidMarket } from "./useMarket";
import { useGetAddressToToken } from "./useTokens";
import type { WrappedTokenInfo } from "./useTokens2";

export const useLendginesForTokens = (
  tokens: HookArg<readonly [WrappedTokenInfo, WrappedTokenInfo]>
) => {
  const lendgines = useAllLendgines();

  return useMemo(() => {
    if (!tokens || !lendgines) return null;
    return lendgines.filter(
      (l) =>
        (l.token0.equals(tokens[0]) && l.token1.equals(tokens[1])) ||
        (l.token0.equals(tokens[1]) && l.token1.equals(tokens[0]))
    );
  }, [lendgines, tokens]);
};

export const useLendgine = <L extends Lendgine>(lendgine: HookArg<L>) => {
  const contracts = lendgine
    ? ([
        {
          address: lendgine.address,
          abi: lendgineABI,
          functionName: "totalPositionSize",
        },
        {
          address: lendgine.address,
          abi: lendgineABI,
          functionName: "totalLiquidityBorrowed",
        },
        {
          address: lendgine.address,
          abi: lendgineABI,
          functionName: "rewardPerPositionStored",
        },
        {
          address: lendgine.address,
          abi: lendgineABI,
          functionName: "lastUpdate",
        },
        {
          address: lendgine.address,
          abi: lendgineABI,
          functionName: "totalSupply",
        },
        {
          address: lendgine.address,
          abi: lendgineABI,
          functionName: "reserve0",
        },
        {
          address: lendgine.address,
          abi: lendgineABI,
          functionName: "reserve1",
        },
        {
          address: lendgine.address,
          abi: lendgineABI,
          functionName: "totalLiquidity",
        },
      ] as const)
    : undefined;

  const query = useContractReads({
    //  ^?
    contracts,
    allowFailure: false,
    staleTime: 3_000,
    enabled: !!contracts,
  });

  const parseReturn = (
    lendgineInfo: (typeof query)["data"]
  ): LendgineInfo<L> | undefined => {
    if (!lendgineInfo || !lendgine) return undefined;

    return {
      totalPositionSize: CurrencyAmount.fromRawAmount(
        lendgine.lendgine,
        lendgineInfo[0].toString()
      ),
      totalLiquidityBorrowed: CurrencyAmount.fromRawAmount(
        lendgine.lendgine,
        lendgineInfo[1].toString()
      ),
      rewardPerPositionStored: fractionToPrice(
        new Fraction(lendgineInfo[2].toString(), scale),
        lendgine.lendgine,
        lendgine.token1
      ),
      lastUpdate: +lendgineInfo[3].toString(),
      totalSupply: CurrencyAmount.fromRawAmount(
        lendgine.lendgine,
        lendgineInfo[4].toString()
      ),
      reserve0: CurrencyAmount.fromRawAmount(
        lendgine.token0,
        lendgineInfo[5].toString()
      ),
      reserve1: CurrencyAmount.fromRawAmount(
        lendgine.token1,
        lendgineInfo[6].toString()
      ),
      totalLiquidity: CurrencyAmount.fromRawAmount(
        lendgine.lendgine,
        lendgineInfo[7].toString()
      ),
    };
  };

  const updatedQuery = {
    ...query,
    data: parseReturn(query.data),
    refetch: async (options: Parameters<(typeof query)["refetch"]>[0]) => {
      const data = await query.refetch(options);
      return parseReturn(data.data);
    },
  };

  return updatedQuery;
};

export const useLendgines = <L extends Lendgine>(
  lendgines: HookArg<readonly L[]>
) => {
  const contracts = useMemo(
    () =>
      lendgines
        ? lendgines.flatMap(
            (lendgine) =>
              [
                {
                  address: lendgine.address,
                  abi: lendgineABI,
                  functionName: "totalPositionSize",
                },
                {
                  address: lendgine.address,
                  abi: lendgineABI,
                  functionName: "totalLiquidityBorrowed",
                },
                {
                  address: lendgine.address,
                  abi: lendgineABI,
                  functionName: "rewardPerPositionStored",
                },
                {
                  address: lendgine.address,
                  abi: lendgineABI,
                  functionName: "lastUpdate",
                },
                {
                  address: lendgine.address,
                  abi: lendgineABI,
                  functionName: "totalSupply",
                },
                {
                  address: lendgine.address,
                  abi: lendgineABI,
                  functionName: "reserve0",
                },
                {
                  address: lendgine.address,
                  abi: lendgineABI,
                  functionName: "reserve1",
                },
                {
                  address: lendgine.address,
                  abi: lendgineABI,
                  functionName: "totalLiquidity",
                },
              ] as const
          )
        : undefined,
    [lendgines]
  );

  const query = useContractReads({
    //  ^?
    contracts,
    allowFailure: false,
    staleTime: 3_000,
    enabled: !!lendgines,
  });

  const parseReturn = (
    lendginesQuery: (typeof query)["data"]
  ): LendgineInfo<L>[] | undefined => {
    if (!lendginesQuery) return undefined;

    return chunk(lendginesQuery, 8).map((c, i) => {
      const lendgineInfo = c as Tuple<BigNumber, 8>;
      const lendgine = lendgines?.[i];
      invariant(lendgine);

      return {
        totalPositionSize: CurrencyAmount.fromRawAmount(
          lendgine.lendgine,
          lendgineInfo[0].toString()
        ),
        totalLiquidityBorrowed: CurrencyAmount.fromRawAmount(
          lendgine.lendgine,
          lendgineInfo[1].toString()
        ),
        rewardPerPositionStored: fractionToPrice(
          new Fraction(lendgineInfo[2].toString(), scale),
          lendgine.lendgine,
          lendgine.token1
        ),
        lastUpdate: +lendgineInfo[3].toString(),
        totalSupply: CurrencyAmount.fromRawAmount(
          lendgine.lendgine,
          lendgineInfo[4].toString()
        ),
        reserve0: CurrencyAmount.fromRawAmount(
          lendgine.token0,
          lendgineInfo[5].toString()
        ),
        reserve1: CurrencyAmount.fromRawAmount(
          lendgine.token1,
          lendgineInfo[6].toString()
        ),
        totalLiquidity: CurrencyAmount.fromRawAmount(
          lendgine.lendgine,
          lendgineInfo[7].toString()
        ),
      };
    });
  };

  const updatedQuery = {
    ...query,
    data: parseReturn(query.data),
    refetch: async (options: Parameters<(typeof query)["refetch"]>[0]) => {
      const data = await query.refetch(options);
      return parseReturn(data.data);
    },
  };

  return updatedQuery;
};

export const useLendginePosition = <L extends Lendgine>(
  lendgine: HookArg<L>,
  address: HookArg<Address>
) => {
  const environment = useEnvironment();
  const positionQuery = useLiquidityManagerPositions({
    address: environment.base.liquidityManager,
    args: address && lendgine ? [address, lendgine.address] : undefined,
    staleTime: 3_000,
    enabled: !!lendgine && !!address,
  });

  // This function should be generalized to take the FetchBalanceResult type and then parsing it
  // parse the return type into a more expressive type
  const parseReturn = (
    position: (typeof positionQuery)["data"]
  ): LendginePosition<L> | undefined => {
    if (!position) return undefined;
    invariant(lendgine); // if a balance is returned then the data passed must be valid
    return {
      size: CurrencyAmount.fromRawAmount(
        lendgine.lendgine,
        position.size.toString()
      ),
      rewardPerPositionPaid: fractionToPrice(
        new Fraction(position.rewardPerPositionPaid.toString()),
        lendgine.lendgine,
        lendgine.token1
      ),
      tokensOwed: CurrencyAmount.fromRawAmount(
        lendgine.token1,
        position.tokensOwed.toString()
      ),
    };
  };

  // This could be generalized into a function
  // update the query with the parsed data type
  const updatedQuery = {
    ...positionQuery,
    data: parseReturn(positionQuery.data),
    refetch: async (
      options: Parameters<(typeof positionQuery)["refetch"]>[0]
    ) => {
      const balance = await positionQuery.refetch(options);
      return parseReturn(balance.data);
    },
  };

  return updatedQuery;
};

export const useLendginesPosition = <L extends Lendgine>(
  lendgines: HookArg<readonly L[]>,
  address: HookArg<Address>
) => {
  const environment = useEnvironment();
  const contracts = useMemo(
    () =>
      !!lendgines && !!address
        ? lendgines.map(
            (l) =>
              ({
                address: environment.base.liquidityManager,
                abi: liquidityManagerABI,
                functionName: "positions",
                args: [address, l.address],
              } as const)
          )
        : undefined,
    [address, environment.base.liquidityManager, lendgines]
  );

  const positionsQuery = useContractReads({
    contracts,
    staleTime: 3_000,
    allowFailure: false,
    enabled: !!contracts,
  });

  // This function should be generalized to take the FetchBalanceResult type and then parsing it
  // parse the return type into a more expressive type
  const parseReturn = (
    positions: (typeof positionsQuery)["data"]
  ): LendginePosition<L>[] | undefined => {
    if (!positions) return undefined;
    invariant(lendgines); // if a balance is returned then the data passed must be valid
    return positions.map((p, i) => {
      const lendgine = lendgines[i];
      invariant(lendgine);
      return {
        size: CurrencyAmount.fromRawAmount(
          lendgine.lendgine,
          p.size.toString()
        ),
        rewardPerPositionPaid: fractionToPrice(
          new Fraction(p.rewardPerPositionPaid.toString(), scale),
          lendgine.lendgine,
          lendgine.token1
        ),
        tokensOwed: CurrencyAmount.fromRawAmount(
          lendgine.token1,
          p.tokensOwed.toString()
        ),
      };
    });
  };

  // This could be generalized into a function
  // update the query with the parsed data type
  const updatedQuery = {
    ...positionsQuery,
    data: parseReturn(positionsQuery.data),
    refetch: async (
      options: Parameters<(typeof positionsQuery)["refetch"]>[0]
    ) => {
      const balance = await positionsQuery.refetch(options);
      return parseReturn(balance.data);
    },
  };

  return updatedQuery;
};

export const useExistingLendginesQueryKey = () => {
  const chain = useChain();
  const client = useClient();

  return ["existing lendgines", chain, client.numoen] as const;
};

export const useExistingLendginesQueryFn = () => {
  const client = useClient();
  return useCallback(async () => {
    const lendginesRes = await client.numoen.request(LendginesDocument);
    return parseLendgines(lendginesRes);
  }, [client.numoen]);
};

export const useExistingLendginesQuery = () => {
  const queryKey = useExistingLendginesQueryKey();
  const queryFn = useExistingLendginesQueryFn();

  return useQuery<RawLendgine[]>(queryKey, queryFn, { staleTime: Infinity });
};

export const useAllLendgines = () => {
  const environment = useEnvironment();
  const addressToToken = useGetAddressToToken();
  const lendginesQuery = useExistingLendginesQuery();
  const chainID = useChain();

  return useMemo(() => {
    if (lendginesQuery.isLoading || !lendginesQuery.data) return null;

    return lendginesQuery.data
      .map((ld): Lendgine | undefined => {
        const token0 = addressToToken(ld.token0);
        const token1 = addressToToken(ld.token1);

        if (!token0 || !token1) return undefined; // tokens must be in token list
        // one of the tokens must be wrapped native or specialty
        if (
          !isValidMarket(
            token0,
            token1,
            environment.interface.wrappedNative,
            environment.interface.specialtyMarkets
          )
        )
          return undefined;

        const ub = new Fraction(ld.upperBound, scale);

        // bound must be a power of 2
        const quotient = ub.greaterThan(1) ? ub.quotient : ub.invert().quotient;
        if (!JSBI.bitwiseAnd(quotient, JSBI.subtract(quotient, JSBI.BigInt(1))))
          return undefined;

        return {
          token0,
          token1,
          token0Exp: ld.token0Exp,
          token1Exp: ld.token1Exp,
          bound: fractionToPrice(ub, token1, token0),
          lendgine: new Token(chainID, ld.address, 18),
          address: ld.address,
        };
      })
      .filter((f): f is Lendgine => !!f);
  }, [
    addressToToken,
    chainID,
    environment.interface.specialtyMarkets,
    environment.interface.wrappedNative,
    lendginesQuery.data,
    lendginesQuery.isLoading,
  ]);
};
