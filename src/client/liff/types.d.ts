declare const liff: any;

interface HTMLElement {
  disabled?: boolean;
  src?: string;
  value?: string;
}

interface EventTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

interface Window {
  __LIFF_ID__?: string;
  liff?: any;
  handleJoinCompany?: any;
  showEnrolledView?: any;
  showOnboardingView?: any;
  closeSuccessModalAndGoToCheckin?: any;
  handleModalFriendClick?: any;
  checkFriendshipStatus?: any;
  switchView?: any;
  changeCalendarMonth?: any;
  selectDayDetail?: any;
  setApprType?: any;
  removeApprProof?: any;
  loadMyApprovals?: any;
  performCheckin?: any;
  registerCurrentWifiIp?: any;
  sendLineCommand?: any;
  cancelDeviceSwitch?: any;
  confirmAndExecuteDeviceSwitch?: any;
  getAvailableTabs?: any;
  canAccessAdminTab?: any;
  initLiff?: any;
  initSwipeGestures?: any;
  handleApprSubmit?: any;
  onApprDateChange?: any;
  handleApprProofSelected?: any;
  loadMonthlyAttendance?: any;
}
