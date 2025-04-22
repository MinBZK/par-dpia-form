export enum ViewState {
  Landing = 'landing',
  DPIA = 'dpia',
  PreScanDPIA = 'prescan'
}

export interface NavigationFunctions {
  goToLanding: () => void;
  goToDPIA: () => void;
  goToPreScanDPIA: () => void;
}
