-- AlterTable
ALTER TABLE "songs" ADD COLUMN     "hymn_number" INTEGER;

-- CreateIndex
--
-- Ordenar hino por numero e o modo natural de percorrer um hinario, e a aba
-- "Hinos" do repertorio faz exatamente isso. Sem o indice, seria varredura da
-- tabela inteira a cada abertura.
CREATE INDEX "songs_team_id_hymn_number_idx" ON "songs"("team_id", "hymn_number");
