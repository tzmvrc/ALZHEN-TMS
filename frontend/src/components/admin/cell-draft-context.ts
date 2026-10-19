import {createContext} from "react";
import type {DraftTarget} from "../../services/cell-draft.service";
export const CellDraftContext=createContext<DraftTarget|null>(null);
