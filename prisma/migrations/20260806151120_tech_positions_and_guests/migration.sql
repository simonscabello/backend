-- AlterEnum
ALTER TYPE "PositionCategory" ADD VALUE 'TECH';

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "is_guest" BOOLEAN NOT NULL DEFAULT false;
