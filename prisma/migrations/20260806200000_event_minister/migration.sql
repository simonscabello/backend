-- O "responsável" deixa de ser por função e passa a ser um por escala.
--
-- `assignments.is_leader` nasceu de um mal-entendido: marcava um responsável
-- dentro de cada função. O papel real é outro -- uma pessoa conduz a
-- ministração inteira do louvor (lê os versículos, fala antes das músicas,
-- delega), e isso não pertence a nenhuma função. A coluna sai inteira; não há
-- o que preservar, porque o dado que ela guardava respondia à pergunta errada.

-- AlterTable
ALTER TABLE "assignments" DROP COLUMN "is_leader";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "minister_membership_id" UUID;

-- AddForeignKey
--
-- SET NULL, e não CASCADE: remover a pessoa da equipe não pode apagar a escala
-- inteira. A escala fica sem ministrante e o líder escolhe outro.
ALTER TABLE "events" ADD CONSTRAINT "events_minister_membership_id_fkey" FOREIGN KEY ("minister_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
