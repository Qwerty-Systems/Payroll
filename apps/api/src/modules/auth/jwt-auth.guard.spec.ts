import jwt from 'jsonwebtoken';
import { auth0TokenFailureCode } from './jwt-auth.guard';

describe('auth0TokenFailureCode', () => {
  it('distinguishes expired tokens', () => {
    expect(auth0TokenFailureCode(new jwt.TokenExpiredError('jwt expired', new Date()))).toBe('TOKEN_EXPIRED');
  });

  it('distinguishes not-yet-active tokens', () => {
    expect(auth0TokenFailureCode(new jwt.NotBeforeError('jwt not active', new Date()))).toBe('TOKEN_NOT_ACTIVE');
  });

  it('distinguishes audience and issuer mismatches', () => {
    expect(auth0TokenFailureCode(new jwt.JsonWebTokenError('jwt audience invalid. expected: api'))).toBe('AUDIENCE_MISMATCH');
    expect(auth0TokenFailureCode(new jwt.JsonWebTokenError('jwt issuer invalid. expected: issuer'))).toBe('ISSUER_MISMATCH');
  });

  it('distinguishes signature and algorithm failures', () => {
    expect(auth0TokenFailureCode(new jwt.JsonWebTokenError('invalid signature'))).toBe('INVALID_SIGNATURE');
    expect(auth0TokenFailureCode(new jwt.JsonWebTokenError('invalid algorithm'))).toBe('INVALID_ALGORITHM');
  });

  it('does not expose arbitrary verification errors as detailed categories', () => {
    expect(auth0TokenFailureCode(new Error('network details'))).toBe('JWKS_OR_VERIFICATION_FAILURE');
  });
});
