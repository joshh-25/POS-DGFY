import { fnbRepository } from './repositories/fnbRepository.js';
import {
  buildFnbDashboardUseCase,
  buildListModifierGroupsUseCase,
  buildCreateModifierGroupUseCase,
  buildUpdateModifierGroupUseCase,
  buildListDiningAreasUseCase,
  buildCreateDiningAreaUseCase,
  buildUpdateDiningTableStatusUseCase,
  buildListKitchenStationsUseCase,
  buildCreateKitchenStationUseCase,
  buildListItemKitchenRoutesUseCase,
  buildUpsertItemKitchenRouteUseCase,
  buildListItemModifierGroupsUseCase,
  buildReplaceItemModifierGroupsUseCase,
  buildListFolderModifierGroupsUseCase,
  buildReplaceFolderModifierGroupsUseCase,
  buildListChecksUseCase,
  buildCreateCheckUseCase,
  buildAddCheckLineUseCase,
  buildUpdateCheckStatusUseCase,
  buildTransferCheckUseCase,
  buildSplitCheckUseCase,
  buildMergeChecksUseCase,
  buildCreateKitchenTicketUseCase,
  buildUpdateKitchenTicketStatusUseCase,
  buildListReservationsUseCase,
  buildCreateReservationUseCase,
  buildUpdateReservationStatusUseCase,
  buildGetServiceChargeSettingsUseCase,
  buildUpdateServiceChargeSettingsUseCase
} from './usecases/fnbUseCases.js';

export const fnbDashboardUseCase = buildFnbDashboardUseCase({ fnbRepository });
export const listFnbModifierGroupsUseCase = buildListModifierGroupsUseCase({ fnbRepository });
export const createFnbModifierGroupUseCase = buildCreateModifierGroupUseCase({ fnbRepository });
export const updateFnbModifierGroupUseCase = buildUpdateModifierGroupUseCase({ fnbRepository });
export const listFnbDiningAreasUseCase = buildListDiningAreasUseCase({ fnbRepository });
export const createFnbDiningAreaUseCase = buildCreateDiningAreaUseCase({ fnbRepository });
export const updateFnbDiningTableStatusUseCase = buildUpdateDiningTableStatusUseCase({ fnbRepository });
export const listFnbKitchenStationsUseCase = buildListKitchenStationsUseCase({ fnbRepository });
export const createFnbKitchenStationUseCase = buildCreateKitchenStationUseCase({ fnbRepository });
export const listFnbItemKitchenRoutesUseCase = buildListItemKitchenRoutesUseCase({ fnbRepository });
export const upsertFnbItemKitchenRouteUseCase = buildUpsertItemKitchenRouteUseCase({ fnbRepository });
export const listFnbItemModifierGroupsUseCase = buildListItemModifierGroupsUseCase({ fnbRepository });
export const replaceFnbItemModifierGroupsUseCase = buildReplaceItemModifierGroupsUseCase({ fnbRepository });
export const listFnbFolderModifierGroupsUseCase = buildListFolderModifierGroupsUseCase({ fnbRepository });
export const replaceFnbFolderModifierGroupsUseCase = buildReplaceFolderModifierGroupsUseCase({ fnbRepository });
export const listFnbChecksUseCase = buildListChecksUseCase({ fnbRepository });
export const createFnbCheckUseCase = buildCreateCheckUseCase({ fnbRepository });
export const addFnbCheckLineUseCase = buildAddCheckLineUseCase({ fnbRepository });
export const updateFnbCheckStatusUseCase = buildUpdateCheckStatusUseCase({ fnbRepository });
export const transferFnbCheckUseCase = buildTransferCheckUseCase({ fnbRepository });
export const splitFnbCheckUseCase = buildSplitCheckUseCase({ fnbRepository });
export const mergeFnbChecksUseCase = buildMergeChecksUseCase({ fnbRepository });
export const createFnbKitchenTicketUseCase = buildCreateKitchenTicketUseCase({ fnbRepository });
export const updateFnbKitchenTicketStatusUseCase = buildUpdateKitchenTicketStatusUseCase({ fnbRepository });
export const listFnbReservationsUseCase = buildListReservationsUseCase({ fnbRepository });
export const createFnbReservationUseCase = buildCreateReservationUseCase({ fnbRepository });
export const updateFnbReservationStatusUseCase = buildUpdateReservationStatusUseCase({ fnbRepository });
export const getFnbServiceChargeSettingsUseCase = buildGetServiceChargeSettingsUseCase({ fnbRepository });
export const updateFnbServiceChargeSettingsUseCase = buildUpdateServiceChargeSettingsUseCase({ fnbRepository });
