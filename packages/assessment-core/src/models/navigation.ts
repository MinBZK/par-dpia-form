import { FormType } from './dpia'

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
  // Optional so boekhouding-frontend (which has no separate IAMA view) need not stub it.
  goToIAMA?: () => void
}
