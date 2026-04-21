export function applyNoColor(noColor: string | boolean | (string | boolean)[] | undefined): void {
  if (noColor) {
    process.env['NO_COLOR'] = '1';
  }
}
