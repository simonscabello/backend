/// Conversao entre hora de parede (o que esta no relogio da igreja) e instante
/// em UTC (o que vai para o banco).
///
/// O app tem o pacote `timezone` com a base IANA completa e faz essa conta
/// sozinho ao montar a escala. Aqui ela e necessaria em um caso so: aplicar uma
/// mudanca da grade as escalas futuras, que precisa manter a data e trocar so o
/// horario. Fazer isso no app custaria uma requisicao por escala e deixaria a
/// operacao pela metade se uma falhasse.
///
/// Sem dependencia nova: `Intl` ja carrega a base de fusos do ICU.

/// Deslocamento do fuso, em ms, para um instante especifico.
///
/// O truque: formata o instante no fuso alvo e le o resultado como se fosse
/// UTC. A diferenca para o instante original e o deslocamento naquele momento
/// -- o que faz a conta valer tambem onde existe horario de verao.
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  // `hour12: false` devolve 24 para a meia-noite em alguns ambientes.
  const hour = get('hour') % 24;

  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );

  return asIfUtc - instant.getTime();
}

/// Data civil (ano, mes, dia) de um instante, no fuso informado.
export function civilDateInZone(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(instant)
    .split('-')
    .map(Number);

  return { year: parts[0], month: parts[1], day: parts[2] };
}

/// Instante em UTC de uma hora de parede num fuso.
///
/// Duas passadas: a primeira chuta o deslocamento usando a propria hora de
/// parede como se fosse UTC; a segunda confere o deslocamento no instante
/// resultante. Elas so divergem na virada do horario de verao, e e ai que a
/// segunda passada corrige.
export function wallClockToUtc(
  date: { year: number; month: number; day: number },
  minutesOfDay: number,
  timeZone: string,
): Date {
  const asIfUtc = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    Math.floor(minutesOfDay / 60),
    minutesOfDay % 60,
  );

  const firstGuess = new Date(asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone));
  const secondOffset = zoneOffsetMs(firstGuess, timeZone);

  return new Date(asIfUtc - secondOffset);
}

/// Mantem a data do instante e troca so o horario, no fuso da equipe.
export function replaceTimeOfDay(
  instant: Date,
  minutesOfDay: number,
  timeZone: string,
): Date {
  return wallClockToUtc(
    civilDateInZone(instant, timeZone),
    minutesOfDay,
    timeZone,
  );
}
