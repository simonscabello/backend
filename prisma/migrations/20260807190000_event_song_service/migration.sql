-- Repertorio por culto: a musica passa a pertencer a um horario da escala,
-- e nao a escala inteira. Manha e noite tem repertorios proprios.
--
-- Em tres passos porque a coluna e NOT NULL e as linhas ja existem: cria
-- nulavel, preenche, tranca. Rodar cedo e barato -- `event_songs` esta
-- praticamente vazia; depois de a igreja montar escalas, nao e mais.

-- 1. A coluna nasce nulavel so para caber o backfill.
ALTER TABLE "event_songs" ADD COLUMN "service_id" UUID;

-- 2. Rede de seguranca: escala que tenha repertorio mas nenhum culto nao
--    conseguiria ser preenchida, e o SET NOT NULL abaixo derrubaria o deploy.
--    Nao deve existir (toda escala e criada com pelo menos um culto), mas o
--    custo de garantir e uma linha. O rotulo e o horario sao os mesmos que o
--    app ja usa como fallback ao exibir uma escala sem cultos.
INSERT INTO "event_services" ("id", "event_id", "label", "starts_at", "sort_order")
SELECT gen_random_uuid(), e."id", 'Culto', e."starts_at", 0
FROM "events" e
WHERE EXISTS (SELECT 1 FROM "event_songs" es WHERE es."event_id" = e."id")
  AND NOT EXISTS (SELECT 1 FROM "event_services" s WHERE s."event_id" = e."id");

-- 3. Backfill: tudo o que ja existia vai para o primeiro culto da escala.
--    `starts_at` antes de `sort_order` porque o horario e o criterio real de
--    "primeiro"; o sort_order so desempata.
UPDATE "event_songs" es
SET "service_id" = (
  SELECT s."id"
  FROM "event_services" s
  WHERE s."event_id" = es."event_id"
  ORDER BY s."starts_at" ASC, s."sort_order" ASC
  LIMIT 1
);

-- 4. Agora sim: sem nulo, nao existe o estado "sem culto definido".
ALTER TABLE "event_songs" ALTER COLUMN "service_id" SET NOT NULL;

-- 5. A chave antiga impedia a mesma musica de manha e a noite -- que e comum.
--    A nova impede a repeticao dentro do mesmo culto, que continua sendo erro.
DROP INDEX "event_songs_event_id_song_id_key";
CREATE UNIQUE INDEX "event_songs_event_id_service_id_song_id_key"
  ON "event_songs" ("event_id", "service_id", "song_id");

-- 6. Cascade: tirar o culto da noite da escala leva junto o repertorio da
--    noite, que e o que "tirei a noite desta semana" significa. O `update` da
--    escala faz upsert por id justamente para que editar o horario nao caia
--    aqui.
ALTER TABLE "event_songs" ADD CONSTRAINT "event_songs_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "event_services"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
