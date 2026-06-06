import { FormType } from '@/models/dpia.ts';

export enum ViewState {
  Landing = 'landing',
  DPIA = FormType.DPIA,
  PreScanDPIA = FormType.PRE_SCAN,
  IAMA = FormType.IAMA,
}

export interface NavigationFunctions {
  goToLanding: () => void
  goToDPIA: () => void
  goToPreScanDPIA: () => void
  goToIAMA: () => void
}
