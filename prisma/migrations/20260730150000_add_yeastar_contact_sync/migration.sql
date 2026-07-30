-- CreateTable
CREATE TABLE "crm_YeastarContactSync" (
    "crmContactId" UUID NOT NULL,
    "yeastarContactId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_YeastarContactSync_pkey" PRIMARY KEY ("crmContactId")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_YeastarContactSync_yeastarContactId_key" ON "crm_YeastarContactSync"("yeastarContactId");

-- CreateIndex
CREATE INDEX "crm_YeastarContactSync_yeastarContactId_idx" ON "crm_YeastarContactSync"("yeastarContactId");

-- AddForeignKey
ALTER TABLE "crm_YeastarContactSync" ADD CONSTRAINT "crm_YeastarContactSync_crmContactId_fkey" FOREIGN KEY ("crmContactId") REFERENCES "crm_Contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
