import { create } from 'zustand';

export interface CartItem {
  serviceCategoryId: string;
  serviceName: string;
  iconName: string;
  quantity: number;
  unit: string;
  specifications: string;
  specialInstructions: string;
  requestedDatetime: string | null;
  estimatedUnitPrice: number;
  estimatedTotalPrice: number;
  fileUri?: string;
  fileName?: string;
  mimeType?: string;
}

export interface VesselInfo {
  vesselName: string;
  imoNumber: string;
  portId: string | null;
  portName: string;
  eta: string | null;
  etd: string | null;
  charterPartyId: string | null;
  charterPartyName: string;
  shipAgentId: string | null;
  shipAgentName: string;
}

interface CartState extends VesselInfo {
  items: CartItem[];
  setVesselInfo: (partial: Partial<VesselInfo>) => void;
  addOrUpdateItem: (item: CartItem) => void;
  removeItem: (serviceCategoryId: string) => void;
  getItem: (serviceCategoryId: string) => CartItem | undefined;
  clear: () => void;
  totalAmount: () => number;
}

const initialVesselInfo: VesselInfo = {
  vesselName: '',
  imoNumber: '',
  portId: null,
  portName: '',
  eta: null,
  etd: null,
  charterPartyId: null,
  charterPartyName: '',
  shipAgentId: null,
  shipAgentName: '',
};

export const useCartStore = create<CartState>()((set, get) => ({
  ...initialVesselInfo,
  items: [],
  setVesselInfo: (partial) => set((state) => ({ ...state, ...partial })),
  addOrUpdateItem: (item) =>
    set((state) => {
      const others = state.items.filter(
        (i) => i.serviceCategoryId !== item.serviceCategoryId
      );
      return { items: [...others, item] };
    }),
  removeItem: (serviceCategoryId) =>
    set((state) => ({
      items: state.items.filter((i) => i.serviceCategoryId !== serviceCategoryId),
    })),
  getItem: (serviceCategoryId) =>
    get().items.find((i) => i.serviceCategoryId === serviceCategoryId),
  clear: () => set({ ...initialVesselInfo, items: [] }),
  totalAmount: () =>
    get().items.reduce((sum, i) => sum + (i.estimatedTotalPrice || 0), 0),
}));
