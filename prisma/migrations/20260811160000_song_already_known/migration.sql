-- AlterTable
ALTER TABLE "songs" ADD COLUMN     "already_known" BOOLEAN NOT NULL DEFAULT false;

-- Todo o acervo que ja existe entra como conhecido.
--
-- Sem isto, a primeira escala depois desta migration sairia com "nova" em
-- musica que a equipe canta ha anos: quem foi importado do Holyrics ou
-- cadastrado antes de as escalas existirem nao tem historico no app, e ausencia
-- de historico nao e o mesmo que estreia.
UPDATE "songs" SET "already_known" = true;

-- DropColumn
--
-- A marca deixou de ser da linha da escala. "Nova" e um fato entre a equipe e a
-- musica -- ou ela ja foi tocada, ou nao foi --, e um campo por escala deixava
-- marcar como estreia a musica repetida um ano depois. Agora o servidor deriva
-- de escalas anteriores da equipe.
ALTER TABLE "event_songs" DROP COLUMN "is_new";
