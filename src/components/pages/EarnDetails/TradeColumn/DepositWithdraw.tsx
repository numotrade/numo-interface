import { useEarnDetails } from "../EarnDetailsInner";
import { Deposit } from "./Deposit";
import { Withdraw } from "./Withdraw";

export const DepositWithdraw: React.FC = () => {
  const { close } = useEarnDetails();
  return close ? <Withdraw /> : <Deposit />;
};