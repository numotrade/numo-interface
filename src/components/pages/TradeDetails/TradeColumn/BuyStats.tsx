import type { Percent } from "@uniswap/sdk-core";
import { useMemo } from "react";
import invariant from "tiny-invariant";

import {
  isLongLendgine,
  pickLongLendgines,
  pickShortLendgines,
} from "../../../../utils/lendgines";
import {
  nextHighestLendgine,
  nextLowestLendgine,
} from "../../../../utils/Numoen/price";
import { LoadingSpinner } from "../../../common/LoadingSpinner";
import { Plus } from "../../../common/Plus";
import { RowBetween } from "../../../common/RowBetween";
import { useTradeDetails } from "../TradeDetailsInner";

interface Props {
  borrowRate: Percent | null;
}

export const BuyStats: React.FC<Props> = ({ borrowRate }: Props) => {
  const { base, selectedLendgine, lendgines, setSelectedLendgine } =
    useTradeDetails();
  const isInverse = !isLongLendgine(selectedLendgine, base);

  const { nextLendgine, lowerLendgine } = useMemo(() => {
    const similarLendgines = isInverse
      ? pickShortLendgines(lendgines, base)
      : pickLongLendgines(lendgines, base);

    const nextLendgine = nextHighestLendgine({
      lendgine: selectedLendgine,
      lendgines: similarLendgines,
    });

    const lowerLendgine = nextLowestLendgine({
      lendgine: selectedLendgine,
      lendgines: similarLendgines,
    });

    return { nextLendgine, lowerLendgine };
  }, [base, isInverse, lendgines, selectedLendgine]);

  return (
    <div tw="flex flex-col w-full">
      <RowBetween tw="p-0">
        <p>Bound</p>
        <div tw="flex items-center gap-1">
          {(isInverse ? !!nextLendgine : !!lowerLendgine) && (
            <Plus
              icon="minus"
              onClick={() => {
                const lendgine = isInverse ? nextLendgine : lowerLendgine;
                invariant(lendgine);
                setSelectedLendgine(lendgine);
              }}
            />
          )}
          {(isInverse ? !!lowerLendgine : !!nextLendgine) && (
            <Plus
              icon="plus"
              onClick={() => {
                const lendgine = isInverse ? lowerLendgine : nextLendgine;
                invariant(lendgine);
                setSelectedLendgine(lendgine);
              }}
            />
          )}
          {(isInverse
            ? selectedLendgine.bound.invert()
            : selectedLendgine.bound
          ).asFraction.toSignificant(5, {
            groupSeparator: ",",
          })}
        </div>
      </RowBetween>
      <RowBetween tw="p-0">
        <p>Funding APR</p>
        <p>
          {borrowRate ? (
            borrowRate.toFixed(2, { groupSeparator: "," }) + "%"
          ) : (
            <LoadingSpinner />
          )}
        </p>
      </RowBetween>
      <RowBetween tw="p-0">
        <p>Leverage</p>
        <p>{isInverse ? "1/x" : "x²"}</p>
      </RowBetween>
      <RowBetween tw="p-0">
        <p>Liquidation price</p>
        <p>{isInverse ? "∞" : 0}</p>
      </RowBetween>
      <RowBetween tw="p-0">
        <p>Fees</p>
        <p>0</p>
      </RowBetween>
    </div>
  );
};
