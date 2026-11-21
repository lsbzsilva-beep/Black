import { KeyItem } from './types';

export const BLACKWOOD_KEYS: Record<string, KeyItem> = {
  'key-farmacia': {
    id: 'key-farmacia',
    name: 'Chave do Boticário (Farmácia)',
    shortName: 'Farmácia',
    location: '2º Andar · Ambulatório',
  },
  'key-diretoria': {
    id: 'key-diretoria',
    name: 'Chave de Latão da Diretoria',
    shortName: 'Diretoria',
    location: '2º Andar · Farmácia',
  },
  'key-morgue': {
    id: 'key-morgue',
    name: 'Chave Fria da Morgue',
    shortName: 'Morgue',
    location: '2º Andar · Diretoria',
  },
  'key-capela': {
    id: 'key-capela',
    name: 'Chave de Ferro da Capela',
    shortName: 'Capela',
    location: '3º Andar · Morgue',
  },
};

export const BLACKWOOD_KEY_ORDER: string[] = [
  'key-farmacia',
  'key-diretoria',
  'key-morgue',
  'key-capela',
];
