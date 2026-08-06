-- CreateTable
CREATE TABLE "unavailabilities" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unavailabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unavailabilities_membership_id_date_idx" ON "unavailabilities"("membership_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "unavailabilities_membership_id_date_key" ON "unavailabilities"("membership_id", "date");

-- AddForeignKey
ALTER TABLE "unavailabilities" ADD CONSTRAINT "unavailabilities_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
