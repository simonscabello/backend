-- O título da escala vira opcional.
--
-- Ele era obrigatório e, no domingo comum, acabava preenchido com "Domingo" --
-- ao lado de um selo que já mostrava DOM 9 AGO. Repetia a data em vez de
-- informar. Agora só existe quando há o que nomear: Páscoa, Ceia, Batismo.
--
-- Sem backfill de propósito. Seria fácil apagar os títulos que "parecem" dia
-- da semana, mas uma migration não deveria adivinhar qual texto o usuário quis
-- escrever: "Domingo Manhã" pode ter sido intenção. Os títulos antigos
-- continuam aparecendo; quem quiser limpa editando a escala.

-- AlterTable
ALTER TABLE "events" ALTER COLUMN "title" DROP NOT NULL;
