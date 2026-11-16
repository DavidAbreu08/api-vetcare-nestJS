export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret?.trim()) throw new Error('JWT_SECRET_KEY is required');
  return secret;
}
