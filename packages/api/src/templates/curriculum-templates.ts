export interface TopicTemplate {
  name: string;
  contentType: 'vocabulary' | 'grammar' | 'orthography' | 'mixed';
  description: string;
  estimatedItems: number;
}

export const SPANISH_A1_TEMPLATE: TopicTemplate[] = [
  {
    name: 'Alphabet & Pronunciation',
    contentType: 'orthography',
    description: 'Spanish alphabet, vowels, consonants, special characters (ñ, á, é, í, ó, ú)',
    estimatedItems: 50,
  },
  {
    name: 'Greetings & Introductions',
    contentType: 'vocabulary',
    description: 'Hola, adiós, buenos días, ¿cómo estás?, me llamo...',
    estimatedItems: 30,
  },
  {
    name: 'Numbers 1-100',
    contentType: 'vocabulary',
    description: 'Cardinal numbers, counting, basic math expressions',
    estimatedItems: 40,
  },
  {
    name: 'Days & Months',
    contentType: 'vocabulary',
    description: 'Days of week, months, seasons, dates',
    estimatedItems: 25,
  },
  {
    name: 'Present Tense - Regular Verbs',
    contentType: 'grammar',
    description: '-ar, -er, -ir verb conjugations in present tense',
    estimatedItems: 60,
  },
  {
    name: 'Ser vs Estar',
    contentType: 'grammar',
    description: 'Two forms of "to be" - permanent vs temporary states',
    estimatedItems: 40,
  },
  {
    name: 'Family Members',
    contentType: 'vocabulary',
    description: 'Madre, padre, hermano, hermana, abuelo, etc.',
    estimatedItems: 25,
  },
  {
    name: 'Colors & Descriptions',
    contentType: 'vocabulary',
    description: 'Basic colors, adjective agreement, descriptions',
    estimatedItems: 35,
  },
  {
    name: 'Articles & Gender',
    contentType: 'grammar',
    description: 'El/la, un/una, masculine/feminine nouns',
    estimatedItems: 30,
  },
  {
    name: 'Food & Drinks',
    contentType: 'vocabulary',
    description: 'Common foods, drinks, restaurant vocabulary',
    estimatedItems: 50,
  },
];

export const CURRICULUM_TEMPLATES: Record<string, Record<string, TopicTemplate[]>> = {
  ES: {
    A1: SPANISH_A1_TEMPLATE,
  },
  IT: {
    A1: [],
  },
  PT: {
    A1: [],
  },
  SL: {
    A1: [],
  },
};
