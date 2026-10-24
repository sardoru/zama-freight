import type { en } from "./dictionaries/en";

/** Same shape as the English dictionary, every leaf a string. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export type Dict = Widen<typeof en>;
