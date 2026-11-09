import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/lib/api';
import { authErrorMessage } from '../src/lib/auth';

describe('authErrorMessage', () => {
  it('names the problem and the way out', () => {
    expect(authErrorMessage(new ApiError(401, 'x'), 'signin')).toMatch(/do not match/);
    expect(authErrorMessage(new ApiError(422, 'x', 'USER_ALREADY_EXISTS'), 'signup')).toMatch(
      /Sign in instead/,
    );
    expect(authErrorMessage(new ApiError(0, 'x'), 'signin')).toMatch(/Could not reach/);
    expect(
      authErrorMessage(new ApiError(400, 'Password too short', 'PASSWORD_TOO_SHORT'), 'signup'),
    ).toMatch(/8 characters/);
    expect(authErrorMessage(new Error('boom'), 'signin')).toMatch(/Try again/);
  });
});
