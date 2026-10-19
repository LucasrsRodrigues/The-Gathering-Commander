// Small text helpers for reading Oracle text and comparing user-provided names.

export function normalizeName(name: string): string {
  return name.trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase()
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

export function numberWord(word: string): number | undefined {
  return NUMBER_WORDS[word.toLowerCase()] ?? (/^\d+$/.test(word) ? Number(word) : undefined)
}

// Type line of the front face (split / modal cards use " // ").
export function frontType(typeLine: string): string {
  return (typeLine.split('//')[0] ?? typeLine).toLowerCase()
}
