-- CreateEnum
CREATE TYPE "SongKind" AS ENUM ('HYMN', 'SONG');

-- CreateEnum
CREATE TYPE "SongPace" AS ENUM ('CALM', 'MODERATE', 'UPBEAT');

-- AlterTable
ALTER TABLE "songs" DROP COLUMN "reference_url",
ADD COLUMN     "chords_url" TEXT,
ADD COLUMN     "composer" TEXT,
ADD COLUMN     "kind" "SongKind",
ADD COLUMN     "lyrics" TEXT,
ADD COLUMN     "lyrics_url" TEXT,
ADD COLUMN     "pace" "SongPace",
ADD COLUMN     "search_text" TEXT NOT NULL,
ADD COLUMN     "spotify_url" TEXT,
ADD COLUMN     "youtube_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "songs_team_id_external_source_external_id_key" ON "songs"("team_id", "external_source", "external_id");

