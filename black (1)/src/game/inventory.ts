import { InventoryItem } from './types';

export interface ItemCatalogEntry {
  id: string;
  name: string;
  category: InventoryItem['category'];
  description: string;
  maxStack: number;
  usable: boolean;
  useLabel?: string;
  detailHint?: string;
  grantAmount?: number;
}

export const BLACKWOOD_ITEM_CATALOG: Record<string, ItemCatalogEntry> = {
  'tool-flashlight': {
    id: 'tool-flashlight',
    name: 'Lanterna de Latão 1924',
    category: 'tool',
    description:
      'Lanterna elétrica de latão escovado com interruptor de polegar e lente convexa. Indispensável nos corredores sem energia do sanatório.',
    maxStack: 1,
    usable: true,
    useLabel: 'Ligar / Desligar [F]',
    detailHint: 'Atalho: tecla [F]',
  },
  'weapon-pistol': {
    id: 'weapon-pistol',
    name: 'Pistola .32 ACP',
    category: 'weapon',
    description:
      'Semiautomática de bolso fabricada no início da década de 1920, coronha em nogueira e carregador para 7 cartuchos.',
    maxStack: 1,
    usable: true,
    useLabel: 'Empunhar / Guardar [G]',
    detailHint: 'Atirar: Botão Direito ou [Q] · Recarregar: [R]',
  },
  'item-ammo-32': {
    id: 'item-ammo-32',
    name: 'Cartuchos .32 ACP',
    category: 'ammo',
    description:
      'Caixa de papelão encerado contendo munição calibre .32 ACP para defesa pessoal.',
    maxStack: 99,
    usable: true,
    useLabel: 'Recarregar Pistola [R]',
    detailHint: 'Cada caixa encontrada fornece +7 cartuchos',
    grantAmount: 7,
  },
  'item-bandage': {
    id: 'item-bandage',
    name: 'Bandagem Estéril',
    category: 'medical',
    description:
      'Rolo de gaze hospitalar selado em papel pardo da ala de curativos. Ajuda a conter tremores e estabilizar o pulso em momentos de pânico.',
    maxStack: 8,
    usable: true,
    useLabel: 'Aplicar Curativo',
    detailHint: 'Reduz tensão psicológica e estabiliza a respiração',
    grantAmount: 1,
  },
  'item-laudanum': {
    id: 'item-laudanum',
    name: 'Tônico de Láudano (1924)',
    category: 'medical',
    description:
      'Frasco âmbar manipulado pelo boticário do sanatório com rótulo manuscrito. Acalma imediatamente os batimentos cardíacos e firma a mão.',
    maxStack: 6,
    usable: true,
    useLabel: 'Tomar Dose',
    detailHint: 'Zera a tensão e reduz oscilações por 45 segundos',
    grantAmount: 1,
  },
  'item-battery': {
    id: 'item-battery',
    name: 'Célula Seca de Latão',
    category: 'tool',
    description:
      'Pilha cilíndrica seca de zinco-carbono com terminais de latão. Restaura a carga da lanterna de mão e evita falhas no filamento.',
    maxStack: 6,
    usable: true,
    useLabel: 'Trocar Pilha',
    detailHint: 'Restaura +65% da carga da lanterna',
    grantAmount: 1,
  },
  'item-relic-watch': {
    id: 'item-relic-watch',
    name: 'Relógio de Bolso Blackwood',
    category: 'relic',
    description:
      'Relógio de bolso em prata escurecida com as iniciais "A.B." gravadas na tampa. Os ponteiros pararam exatamente às 02:14.',
    maxStack: 1,
    usable: false,
    detailHint: 'Objeto pessoal encontrado na Diretoria',
    grantAmount: 1,
  },
  'item-relic-medal': {
    id: 'item-relic-medal',
    name: 'Medalhão de Santa Clara',
    category: 'relic',
    description:
      'Medalha devocional oxidada com inscrição latina no verso. Pertencia à irmã supervisora da ala de observação.',
    maxStack: 1,
    usable: false,
    detailHint: 'Relíquia encontrada nos aposentos internos',
    grantAmount: 1,
  },
};

export function createInitialInventory(): InventoryItem[] {
  return [
    { ...BLACKWOOD_ITEM_CATALOG['tool-flashlight'], quantity: 1 },
    { ...BLACKWOOD_ITEM_CATALOG['weapon-pistol'], quantity: 1 },
    { ...BLACKWOOD_ITEM_CATALOG['item-ammo-32'], quantity: 42 },
    { ...BLACKWOOD_ITEM_CATALOG['item-bandage'], quantity: 1 },
  ];
}
