import PosDateRangeFilterPanel from './PosDateRangeFilterPanel.jsx';

export default function PosReportsDateFilterPanel(props) {
  return (
    <PosDateRangeFilterPanel
      {...props}
      dialogId="pos-reports-date-dialog"
      titleId="pos-reports-date-title"
      descriptionId="pos-reports-date-description"
      title="Select Date"
      description="Choose a date range for the transaction history."
      datePickerTestIdPrefix="pos-reports-date-calendar"
      cancelTestId="pos-reports-cancel-dates"
      applyTestId="pos-reports-apply-dates"
    />
  );
}
