-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "createdByOrganizerId" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "venues_cityId_createdByOrganizerId_idx" ON "venues"("cityId", "createdByOrganizerId");

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_createdByOrganizerId_fkey" FOREIGN KEY ("createdByOrganizerId") REFERENCES "organizer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
