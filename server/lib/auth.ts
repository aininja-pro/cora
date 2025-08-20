import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cora-tools-secret-change-in-production';

export interface ToolTokenPayload {
  tenantId: string;
  exp: number;
}

export function signToolJWT(payload: { tenantId: string; exp: number }): string {
  return jwt.sign(payload, JWT_SECRET);
}

export function verifyToolJWT(token: string): ToolTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as ToolTokenPayload;
    
    // Check expiration
    if (decoded.exp && Date.now() > decoded.exp) {
      throw new Error('Token expired');
    }
    
    return decoded;
  } catch (error) {
    throw new Error('Invalid token');
  }
}