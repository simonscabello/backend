-- AlterTable
ALTER TABLE "songs" ADD COLUMN     "is_new" BOOLEAN NOT NULL DEFAULT false;

-- Converte o campo anterior em vez de recomecar do zero.
--
-- `already_known` dizia "a equipe ja canta esta"; `is_new` diz o oposto, entao a
-- conversao e a negacao. Na pratica todo o acervo atual sai com `is_new = false`,
-- que e o certo: uma musica so vira novidade quando alguem diz que e.
UPDATE "songs" SET "is_new" = NOT "already_known";

-- DropColumn
--
-- O modelo derivado nao servia. Ele confundia "nova para o APP" com "nova para a
-- EQUIPE" -- musica cantada ha anos que so hoje foi cadastrada entrava como
-- estreia --, e tratava uma unica execucao como fim da novidade. Uma musica
-- deixa de ser nova quando a equipe domina e a igreja conhece, e isso nenhuma
-- consulta responde: quem responde e quem canta.
ALTER TABLE "songs" DROP COLUMN "already_known";
