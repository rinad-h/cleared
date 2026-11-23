"use server";

import { action } from "@/lib/server-action";
import { CertificationCreate, CertificationUpdate } from "@/lib/schemas/catalog";
import * as certifications from "@/server/services/certifications";

export const createCertification = action(CertificationCreate, (actor, input, now, db) =>
  certifications.createCertification(db, actor, input, now),
);

export const updateCertification = action(CertificationUpdate, (actor, input, now, db) =>
  certifications.updateCertification(db, actor, input, now),
);
