import {
  SourceAdapter,
  SourceRequest,
  GeneratedContent,
  SourceLanguage,
} from '../source-adapter.interface';
import { ContentType } from '../../services/work-planner.service';

interface OrthographyRule {
  letter: string;
  ipa: string;
  soundDescription: string;
  examples: string[];
}

const ORTHOGRAPHY_DATA: Record<SourceLanguage, OrthographyRule[]> = {
  EN: [
    {
      letter: 'A',
      ipa: '/eɪ/',
      soundDescription: 'Long "a" as in "day"',
      examples: ['able', 'make', 'table'],
    },
    {
      letter: 'B',
      ipa: '/biː/',
      soundDescription: 'Hard "b" as in "boy"',
      examples: ['ball', 'book', 'baby'],
    },
    {
      letter: 'C',
      ipa: '/siː/',
      soundDescription: 'Soft "c" or hard "k"',
      examples: ['cat', 'city', 'cup'],
    },
    {
      letter: 'D',
      ipa: '/diː/',
      soundDescription: 'Hard "d" as in "dog"',
      examples: ['day', 'door', 'done'],
    },
    {
      letter: 'E',
      ipa: '/iː/',
      soundDescription: 'Long "e" as in "see"',
      examples: ['eat', 'tree', 'be'],
    },
    {
      letter: 'F',
      ipa: '/ef/',
      soundDescription: 'Fricative "f"',
      examples: ['far', 'fish', 'fun'],
    },
    {
      letter: 'G',
      ipa: '/dʒiː/',
      soundDescription: 'Hard or soft "g"',
      examples: ['go', 'girl', 'gym'],
    },
    {
      letter: 'H',
      ipa: '/eɪtʃ/',
      soundDescription: 'Aspirated "h"',
      examples: ['hat', 'home', 'help'],
    },
    {
      letter: 'I',
      ipa: '/aɪ/',
      soundDescription: 'Long "i" as in "I"',
      examples: ['ice', 'time', 'bike'],
    },
    { letter: 'J', ipa: '/dʒeɪ/', soundDescription: 'Soft "j"', examples: ['job', 'jump', 'jar'] },
    { letter: 'K', ipa: '/keɪ/', soundDescription: 'Hard "k"', examples: ['key', 'king', 'keep'] },
    { letter: 'L', ipa: '/el/', soundDescription: 'Liquid "l"', examples: ['leg', 'love', 'like'] },
    { letter: 'M', ipa: '/em/', soundDescription: 'Nasal "m"', examples: ['man', 'moon', 'make'] },
    { letter: 'N', ipa: '/en/', soundDescription: 'Nasal "n"', examples: ['no', 'name', 'new'] },
    {
      letter: 'O',
      ipa: '/oʊ/',
      soundDescription: 'Long "o" as in "go"',
      examples: ['open', 'old', 'over'],
    },
    {
      letter: 'P',
      ipa: '/piː/',
      soundDescription: 'Aspirated "p"',
      examples: ['pen', 'play', 'put'],
    },
    {
      letter: 'Q',
      ipa: '/kjuː/',
      soundDescription: 'Always with "u"',
      examples: ['queen', 'quick', 'quiet'],
    },
    {
      letter: 'R',
      ipa: '/ɑːr/',
      soundDescription: 'Rhotic "r"',
      examples: ['red', 'run', 'right'],
    },
    { letter: 'S', ipa: '/es/', soundDescription: 'Sibilant "s"', examples: ['sun', 'see', 'so'] },
    {
      letter: 'T',
      ipa: '/tiː/',
      soundDescription: 'Aspirated "t"',
      examples: ['tea', 'time', 'top'],
    },
    { letter: 'U', ipa: '/juː/', soundDescription: 'Long "u"', examples: ['use', 'unit', 'you'] },
    {
      letter: 'V',
      ipa: '/viː/',
      soundDescription: 'Voiced "v"',
      examples: ['van', 'very', 'voice'],
    },
    {
      letter: 'W',
      ipa: '/ˈdʌb.əl.juː/',
      soundDescription: 'Glide "w"',
      examples: ['way', 'water', 'with'],
    },
    { letter: 'X', ipa: '/eks/', soundDescription: '"ks" sound', examples: ['box', 'mix', 'fix'] },
    {
      letter: 'Y',
      ipa: '/waɪ/',
      soundDescription: 'Vowel or consonant',
      examples: ['yes', 'year', 'you'],
    },
    {
      letter: 'Z',
      ipa: '/ziː/',
      soundDescription: 'Voiced "z"',
      examples: ['zoo', 'zero', 'zone'],
    },
  ],
  ES: [
    {
      letter: 'A',
      ipa: '/a/',
      soundDescription: 'Open "a" as in "father"',
      examples: ['agua', 'casa', 'mapa'],
    },
    {
      letter: 'B',
      ipa: '/be/',
      soundDescription: 'Bilabial "b"',
      examples: ['bueno', 'boca', 'bien'],
    },
    {
      letter: 'C',
      ipa: '/θe/',
      soundDescription: 'Before e/i: "th", else "k"',
      examples: ['casa', 'cinco', 'comer'],
    },
    { letter: 'D', ipa: '/de/', soundDescription: 'Dental "d"', examples: ['día', 'donde', 'dar'] },
    { letter: 'E', ipa: '/e/', soundDescription: 'Mid "e"', examples: ['este', 'entre', 'ella'] },
    {
      letter: 'F',
      ipa: '/efe/',
      soundDescription: 'Labiodental "f"',
      examples: ['fácil', 'frío', 'feliz'],
    },
    {
      letter: 'G',
      ipa: '/xe/',
      soundDescription: 'Before e/i: guttural, else "g"',
      examples: ['gato', 'grande', 'gente'],
    },
    {
      letter: 'H',
      ipa: '/atʃe/',
      soundDescription: 'Silent',
      examples: ['hola', 'hora', 'hombre'],
    },
    { letter: 'I', ipa: '/i/', soundDescription: 'High "i"', examples: ['isla', 'ir', 'igual'] },
    {
      letter: 'J',
      ipa: '/xota/',
      soundDescription: 'Guttural "j"',
      examples: ['jugar', 'joven', 'junto'],
    },
    {
      letter: 'K',
      ipa: '/ka/',
      soundDescription: 'Only in foreign words',
      examples: ['kilo', 'karma', 'karate'],
    },
    {
      letter: 'L',
      ipa: '/ele/',
      soundDescription: 'Clear "l"',
      examples: ['libro', 'largo', 'luna'],
    },
    {
      letter: 'M',
      ipa: '/eme/',
      soundDescription: 'Bilabial "m"',
      examples: ['mamá', 'mundo', 'mucho'],
    },
    {
      letter: 'N',
      ipa: '/ene/',
      soundDescription: 'Alveolar "n"',
      examples: ['no', 'noche', 'nunca'],
    },
    {
      letter: 'Ñ',
      ipa: '/eɲe/',
      soundDescription: 'Palatal nasal',
      examples: ['año', 'niño', 'español'],
    },
    { letter: 'O', ipa: '/o/', soundDescription: 'Mid "o"', examples: ['ojo', 'otro', 'ocho'] },
    {
      letter: 'P',
      ipa: '/pe/',
      soundDescription: 'Unaspirated "p"',
      examples: ['padre', 'poco', 'pero'],
    },
    {
      letter: 'Q',
      ipa: '/ku/',
      soundDescription: 'Always "qu"',
      examples: ['que', 'quiero', 'queso'],
    },
    {
      letter: 'R',
      ipa: '/ere/',
      soundDescription: 'Tapped or trilled',
      examples: ['río', 'perro', 'caro'],
    },
    {
      letter: 'S',
      ipa: '/ese/',
      soundDescription: 'Voiceless "s"',
      examples: ['sol', 'sí', 'ser'],
    },
    {
      letter: 'T',
      ipa: '/te/',
      soundDescription: 'Dental "t"',
      examples: ['tiempo', 'todo', 'tres'],
    },
    { letter: 'U', ipa: '/u/', soundDescription: 'High "u"', examples: ['uno', 'usted', 'usar'] },
    {
      letter: 'V',
      ipa: '/ube/',
      soundDescription: 'Same as "b"',
      examples: ['vamos', 'vida', 'ver'],
    },
    {
      letter: 'W',
      ipa: '/ube doble/',
      soundDescription: 'Foreign words only',
      examples: ['wifi', 'web', 'whisky'],
    },
    {
      letter: 'X',
      ipa: '/ekis/',
      soundDescription: '"ks" or "s"',
      examples: ['taxi', 'examen', 'México'],
    },
    {
      letter: 'Y',
      ipa: '/i griega/',
      soundDescription: 'Consonant "y" or vowel',
      examples: ['yo', 'ya', 'ayer'],
    },
    {
      letter: 'Z',
      ipa: '/θeta/',
      soundDescription: 'Like "th" in "think"',
      examples: ['zapato', 'zona', 'azul'],
    },
  ],
  IT: [
    { letter: 'A', ipa: '/a/', soundDescription: 'Open "a"', examples: ['amore', 'anno', 'anche'] },
    {
      letter: 'B',
      ipa: '/bi/',
      soundDescription: 'Voiced bilabial',
      examples: ['bene', 'bella', 'buono'],
    },
    {
      letter: 'C',
      ipa: '/tʃi/',
      soundDescription: 'Before e/i: "ch", else "k"',
      examples: ['casa', 'ciao', 'cena'],
    },
    {
      letter: 'D',
      ipa: '/di/',
      soundDescription: 'Dental "d"',
      examples: ['dove', 'dire', 'donna'],
    },
    {
      letter: 'E',
      ipa: '/e/',
      soundDescription: 'Open or closed "e"',
      examples: ['essere', 'era', 'estate'],
    },
    {
      letter: 'F',
      ipa: '/effe/',
      soundDescription: 'Labiodental "f"',
      examples: ['fare', 'fine', 'forte'],
    },
    {
      letter: 'G',
      ipa: '/dʒi/',
      soundDescription: 'Before e/i: "j", else "g"',
      examples: ['gatto', 'gente', 'già'],
    },
    {
      letter: 'H',
      ipa: '/akka/',
      soundDescription: 'Always silent',
      examples: ['ho', 'hai', 'hanno'],
    },
    {
      letter: 'I',
      ipa: '/i/',
      soundDescription: 'High front "i"',
      examples: ['io', 'Italia', 'idea'],
    },
    {
      letter: 'L',
      ipa: '/elle/',
      soundDescription: 'Clear "l"',
      examples: ['luce', 'libro', 'lungo'],
    },
    {
      letter: 'M',
      ipa: '/emme/',
      soundDescription: 'Bilabial "m"',
      examples: ['mamma', 'mondo', 'molto'],
    },
    {
      letter: 'N',
      ipa: '/enne/',
      soundDescription: 'Alveolar "n"',
      examples: ['nome', 'notte', 'nuovo'],
    },
    {
      letter: 'O',
      ipa: '/o/',
      soundDescription: 'Open or closed "o"',
      examples: ['ora', 'oggi', 'otto'],
    },
    {
      letter: 'P',
      ipa: '/pi/',
      soundDescription: 'Unaspirated "p"',
      examples: ['padre', 'poco', 'prima'],
    },
    {
      letter: 'Q',
      ipa: '/ku/',
      soundDescription: 'Always "qu"',
      examples: ['quando', 'questo', 'qui'],
    },
    {
      letter: 'R',
      ipa: '/erre/',
      soundDescription: 'Trilled "r"',
      examples: ['Roma', 'rosso', 'ricco'],
    },
    {
      letter: 'S',
      ipa: '/esse/',
      soundDescription: 'Voiced or voiceless',
      examples: ['sole', 'sera', 'stare'],
    },
    {
      letter: 'T',
      ipa: '/ti/',
      soundDescription: 'Dental "t"',
      examples: ['tempo', 'tutto', 'tanto'],
    },
    {
      letter: 'U',
      ipa: '/u/',
      soundDescription: 'High back "u"',
      examples: ['uno', 'uomo', 'utile'],
    },
    {
      letter: 'V',
      ipa: '/vu/',
      soundDescription: 'Labiodental "v"',
      examples: ['vita', 'vero', 'vedere'],
    },
    {
      letter: 'Z',
      ipa: '/dzeta/',
      soundDescription: 'Voiced or voiceless',
      examples: ['zero', 'zona', 'pizza'],
    },
  ],
  PT: [
    { letter: 'A', ipa: '/a/', soundDescription: 'Open "a"', examples: ['água', 'amigo', 'amor'] },
    {
      letter: 'B',
      ipa: '/be/',
      soundDescription: 'Voiced bilabial',
      examples: ['bom', 'bem', 'bola'],
    },
    {
      letter: 'C',
      ipa: '/se/',
      soundDescription: 'Before e/i: "s", else "k"',
      examples: ['casa', 'cidade', 'comer'],
    },
    { letter: 'D', ipa: '/de/', soundDescription: 'Dental "d"', examples: ['dia', 'dar', 'dizer'] },
    {
      letter: 'E',
      ipa: '/e/',
      soundDescription: 'Various sounds',
      examples: ['este', 'ela', 'entre'],
    },
    {
      letter: 'F',
      ipa: '/efe/',
      soundDescription: 'Labiodental "f"',
      examples: ['falar', 'fazer', 'feliz'],
    },
    {
      letter: 'G',
      ipa: '/ʒe/',
      soundDescription: 'Before e/i: "zh", else "g"',
      examples: ['gato', 'gente', 'grande'],
    },
    { letter: 'H', ipa: '/aga/', soundDescription: 'Silent', examples: ['hora', 'hoje', 'homem'] },
    { letter: 'I', ipa: '/i/', soundDescription: 'High "i"', examples: ['ir', 'ilha', 'isso'] },
    {
      letter: 'J',
      ipa: '/ʒota/',
      soundDescription: 'Like "zh"',
      examples: ['já', 'janela', 'jogo'],
    },
    { letter: 'K', ipa: '/ka/', soundDescription: 'Foreign words', examples: ['kilo', 'karma'] },
    {
      letter: 'L',
      ipa: '/ele/',
      soundDescription: 'Clear or dark "l"',
      examples: ['livro', 'lua', 'lugar'],
    },
    {
      letter: 'M',
      ipa: '/eme/',
      soundDescription: 'Bilabial "m"',
      examples: ['mãe', 'muito', 'mundo'],
    },
    {
      letter: 'N',
      ipa: '/ene/',
      soundDescription: 'Alveolar "n"',
      examples: ['não', 'nome', 'novo'],
    },
    {
      letter: 'O',
      ipa: '/o/',
      soundDescription: 'Open or closed',
      examples: ['olho', 'onde', 'oito'],
    },
    {
      letter: 'P',
      ipa: '/pe/',
      soundDescription: 'Unaspirated "p"',
      examples: ['pai', 'por', 'pouco'],
    },
    {
      letter: 'Q',
      ipa: '/ke/',
      soundDescription: 'Always "qu"',
      examples: ['que', 'quem', 'quando'],
    },
    {
      letter: 'R',
      ipa: '/erre/',
      soundDescription: 'Varies by position',
      examples: ['rio', 'caro', 'porta'],
    },
    {
      letter: 'S',
      ipa: '/esse/',
      soundDescription: 'Various sounds',
      examples: ['ser', 'sim', 'só'],
    },
    {
      letter: 'T',
      ipa: '/te/',
      soundDescription: 'Dental "t"',
      examples: ['tempo', 'ter', 'tudo'],
    },
    { letter: 'U', ipa: '/u/', soundDescription: 'High "u"', examples: ['um', 'usar', 'útil'] },
    {
      letter: 'V',
      ipa: '/ve/',
      soundDescription: 'Labiodental "v"',
      examples: ['ver', 'vida', 'vir'],
    },
    { letter: 'W', ipa: '/dabliu/', soundDescription: 'Foreign words', examples: ['web', 'wifi'] },
    {
      letter: 'X',
      ipa: '/ʃis/',
      soundDescription: 'Various sounds',
      examples: ['xícara', 'exame', 'táxi'],
    },
    { letter: 'Y', ipa: '/ipsilon/', soundDescription: 'Foreign words', examples: ['yoga', 'yen'] },
    {
      letter: 'Z',
      ipa: '/ze/',
      soundDescription: 'Voiced "z"',
      examples: ['zero', 'fazer', 'azul'],
    },
  ],
  SL: [
    {
      letter: 'A',
      ipa: '/aː/',
      soundDescription: 'Long or short "a"',
      examples: ['avto', 'dan', 'mama'],
    },
    {
      letter: 'B',
      ipa: '/be/',
      soundDescription: 'Voiced "b"',
      examples: ['beseda', 'brat', 'biti'],
    },
    {
      letter: 'C',
      ipa: '/tse/',
      soundDescription: 'Like "ts"',
      examples: ['cesta', 'cesar', 'cilj'],
    },
    {
      letter: 'Č',
      ipa: '/tʃe/',
      soundDescription: 'Like "ch"',
      examples: ['čas', 'človek', 'čaj'],
    },
    { letter: 'D', ipa: '/de/', soundDescription: 'Dental "d"', examples: ['dan', 'dom', 'delo'] },
    { letter: 'E', ipa: '/e/', soundDescription: 'Mid "e"', examples: ['en', 'eden', 'evropa'] },
    {
      letter: 'F',
      ipa: '/ef/',
      soundDescription: 'Labiodental "f"',
      examples: ['film', 'fant', 'Flags'],
    },
    {
      letter: 'G',
      ipa: '/ge/',
      soundDescription: 'Voiced "g"',
      examples: ['gora', 'grad', 'glava'],
    },
    {
      letter: 'H',
      ipa: '/ha/',
      soundDescription: 'Velar fricative',
      examples: ['hiša', 'hrana', 'hvala'],
    },
    { letter: 'I', ipa: '/i/', soundDescription: 'High "i"', examples: ['ime', 'igra', 'ideja'] },
    {
      letter: 'J',
      ipa: '/je/',
      soundDescription: 'Like English "y"',
      examples: ['jaz', 'jutro', 'jesti'],
    },
    {
      letter: 'K',
      ipa: '/ka/',
      soundDescription: 'Voiceless "k"',
      examples: ['knjiga', 'konec', 'kava'],
    },
    {
      letter: 'L',
      ipa: '/el/',
      soundDescription: 'Clear "l"',
      examples: ['leto', 'luna', 'ljubezen'],
    },
    {
      letter: 'M',
      ipa: '/em/',
      soundDescription: 'Bilabial "m"',
      examples: ['mati', 'mesto', 'morje'],
    },
    {
      letter: 'N',
      ipa: '/en/',
      soundDescription: 'Alveolar "n"',
      examples: ['nov', 'noč', 'nebo'],
    },
    { letter: 'O', ipa: '/o/', soundDescription: 'Mid "o"', examples: ['oče', 'oko', 'okno'] },
    {
      letter: 'P',
      ipa: '/pe/',
      soundDescription: 'Voiceless "p"',
      examples: ['pot', 'prosim', 'pisati'],
    },
    {
      letter: 'R',
      ipa: '/er/',
      soundDescription: 'Trilled "r"',
      examples: ['roka', 'riba', 'reči'],
    },
    {
      letter: 'S',
      ipa: '/es/',
      soundDescription: 'Voiceless "s"',
      examples: ['sonce', 'srce', 'svet'],
    },
    { letter: 'Š', ipa: '/ʃa/', soundDescription: 'Like "sh"', examples: ['šola', 'ščit', 'šest'] },
    { letter: 'T', ipa: '/te/', soundDescription: 'Dental "t"', examples: ['ti', 'tam', 'tukaj'] },
    { letter: 'U', ipa: '/u/', soundDescription: 'High "u"', examples: ['ura', 'učiti', 'uspeh'] },
    {
      letter: 'V',
      ipa: '/ve/',
      soundDescription: 'Labiodental "v"',
      examples: ['voda', 'vas', 'videti'],
    },
    {
      letter: 'Z',
      ipa: '/ze/',
      soundDescription: 'Voiced "z"',
      examples: ['zelo', 'začeti', 'zvezda'],
    },
    {
      letter: 'Ž',
      ipa: '/ʒe/',
      soundDescription: 'Like "zh"',
      examples: ['življenje', 'žena', 'žival'],
    },
  ],
};

export class RuleBasedAdapter implements SourceAdapter {
  readonly name = 'rule-based';
  readonly supportedTypes = [ContentType.ORTHOGRAPHY];

  canHandle(request: SourceRequest): boolean {
    return (
      request.type === ContentType.ORTHOGRAPHY && ORTHOGRAPHY_DATA[request.language] !== undefined
    );
  }

  generate(request: SourceRequest): Promise<GeneratedContent> {
    if (request.type !== ContentType.ORTHOGRAPHY) {
      return Promise.reject(new Error('Rule-based adapter only supports orthography'));
    }

    const rules = ORTHOGRAPHY_DATA[request.language];
    if (!rules) {
      return Promise.reject(new Error(`No orthography rules for language: ${request.language}`));
    }

    const lessons = rules.map((rule) => ({
      letter: rule.letter,
      ipa: rule.ipa,
      soundDescription: rule.soundDescription,
      exampleWords: rule.examples,
      audioUrl: null,
    }));

    return Promise.resolve({
      contentType: ContentType.ORTHOGRAPHY,
      language: request.language,
      data: {
        lessons,
        totalLetters: rules.length,
      },
      sourceMetadata: {
        sourceName: this.name,
        generatedAt: new Date(),
        confidence: 1.0,
        tokens: 0,
        cost: 0,
      },
    });
  }

  healthCheck(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
