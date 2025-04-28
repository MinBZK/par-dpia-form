import { FormType } from '@/models/dpia';

export enum ViewState {
  Landing = 'landing',
  DPIA = FormType.DPIA,
  PreScanDPIA = FormType.PRE_SCAN,
}

export interface NavigationFunctions {
  goToLanding: () => void
  goToDPIA: () => void
  goToPreScanDPIA: () => void
}
