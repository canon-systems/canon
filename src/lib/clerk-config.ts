import { AUTH_ROUTES } from './clerk-routes';

export const CLERK_LOCALIZATION = {
  formFieldLabel__emailAddress: 'Email address',
  formFieldInputPlaceholder__emailAddress: 'name@company.com',
} as const;

export const CLERK_SIGN_IN_PROPS = {
  signUpUrl: AUTH_ROUTES.signUp,
  forceRedirectUrl: AUTH_ROUTES.afterSignIn,
  fallbackRedirectUrl: AUTH_ROUTES.afterSignIn,
  signUpForceRedirectUrl: AUTH_ROUTES.afterSignUp,
  signUpFallbackRedirectUrl: AUTH_ROUTES.afterSignUp,
} as const;

export const CLERK_SIGN_UP_PROPS = {
  signInUrl: AUTH_ROUTES.signIn,
  forceRedirectUrl: AUTH_ROUTES.afterSignUp,
  fallbackRedirectUrl: AUTH_ROUTES.afterSignUp,
  signInForceRedirectUrl: AUTH_ROUTES.afterSignIn,
  signInFallbackRedirectUrl: AUTH_ROUTES.afterSignIn,
} as const;

export const CLERK_SIGN_IN_BUTTON_PROPS = {
  mode: 'modal',
  forceRedirectUrl: AUTH_ROUTES.afterSignIn,
  fallbackRedirectUrl: AUTH_ROUTES.afterSignIn,
  signUpForceRedirectUrl: AUTH_ROUTES.afterSignUp,
  signUpFallbackRedirectUrl: AUTH_ROUTES.afterSignUp,
} as const;

export const CLERK_SIGN_UP_BUTTON_PROPS = {
  mode: 'modal',
  forceRedirectUrl: AUTH_ROUTES.afterSignUp,
  fallbackRedirectUrl: AUTH_ROUTES.afterSignUp,
  signInForceRedirectUrl: AUTH_ROUTES.afterSignIn,
  signInFallbackRedirectUrl: AUTH_ROUTES.afterSignIn,
} as const;

export const CLERK_EMBEDDED_PROFILE_PROPS = {
  routing: 'hash',
} as const;
