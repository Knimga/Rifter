// The inventory's auto-sort button (the party window's, the vendor's and the enchanter's inventory headers).
import { FaSortAmountDown } from 'react-icons/fa';
import { Hint } from '../Tooltip';

export default function SortItemsButton({ onSort }: { onSort: () => void }) {
  return (
    <Hint text="Auto-sort Inventory">
      <button type="button" className="rf-pt" aria-label="Auto-sort Inventory" onClick={onSort}>
        <FaSortAmountDown aria-hidden="true" className="w-2.5 h-2.5" />
      </button>
    </Hint>
  );
}
