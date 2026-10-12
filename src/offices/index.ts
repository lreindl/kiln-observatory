import type { CellId } from "../crew";
import { AnalystOffice } from "./analyst";
import { DigestOffice } from "./digest";
import { GrowthOffice } from "./growth";
import { ImplementerOffice } from "./implementer";
import type { Office, OfficeOptions } from "./kit";
import { OpsOffice } from "./ops";
import { OwnerOffice } from "./owner";
import { PmOffice } from "./pm";
import { QualityOffice } from "./quality";
import { ReleaseOffice } from "./release";
import { ReviewerOffice } from "./reviewer";

export const OFFICES: Record<CellId, (o: OfficeOptions) => Office> = {
  owner: (o) => new OwnerOffice(o),
  analyst: (o) => new AnalystOffice(o),
  ops: (o) => new OpsOffice(o),
  growth: (o) => new GrowthOffice(o),
  quality: (o) => new QualityOffice(o),
  pm: (o) => new PmOffice(o),
  digest: (o) => new DigestOffice(o),
  implementer: (o) => new ImplementerOffice(o),
  reviewer: (o) => new ReviewerOffice(o),
  release: (o) => new ReleaseOffice(o),
};
