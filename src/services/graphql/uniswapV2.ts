import type { Token } from "@dahlia-labs/token-utils";
import { Fraction } from "@dahlia-labs/token-utils";
import { getAddress } from "@ethersproject/address";
import type { Address } from "wagmi";

import type {
  PairV2Query,
  PriceHistoryDayV2Query,
  PriceHistoryHourV2Query,
  PriceV2Query,
} from "../../gql/uniswapV2/graphql";

export type UniswapV2Pool = {
  token0: Token;
  token1: Token;
  address: Address;
};

export type PricePoint = { timestamp: number; price: Fraction };

export const parsePriceHelper = (price: number) =>
  new Fraction(Math.floor(price * 10 ** 9), 10 ** 9);

// returns null if the id used to query was not valid
export const parsePriceV2 = (priceV2Query: PriceV2Query): Fraction | null =>
  priceV2Query.pair
    ? parsePriceHelper(parseFloat(priceV2Query.pair.token0Price))
    : null;

export const parsePairV2 = (
  pairV2Query: PairV2Query,
  tokens: readonly [Token, Token]
): { pool: UniswapV2Pool; totalLiquidity: number } | null =>
  pairV2Query.pairs[0]
    ? {
        pool: {
          token0: tokens[0],
          token1: tokens[1],
          address: getAddress(pairV2Query.pairs[0].id),
        },
        totalLiquidity: parseFloat(pairV2Query.pairs[0].reserve0) * 2,
      }
    : null;

// returns null if the id used to query was not valid
export const parsePriceHistoryHourV2 = (
  priceHistoryHourV2Query: PriceHistoryHourV2Query
): readonly PricePoint[] | null =>
  priceHistoryHourV2Query.pair
    ? priceHistoryHourV2Query.pair.hourData.map((d) => ({
        timestamp: d.date,
        price: new Fraction(
          Math.floor(parseFloat(d.reserve0) * 10 ** 9),
          Math.floor(parseFloat(d.reserve1) * 10 ** 9)
        ),
      }))
    : null;

export const parsePriceHistoryDayV2 = (
  priceHistoryDayV2Query: PriceHistoryDayV2Query
): readonly PricePoint[] | null =>
  priceHistoryDayV2Query.pair
    ? priceHistoryDayV2Query.pair.dayData.map((d) => ({
        timestamp: d.date,
        price: parsePriceHelper(
          parseFloat(d.reserve0) / parseFloat(d.reserve1)
        ),
      }))
    : null;
