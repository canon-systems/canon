export const AUTH_ROUTES = {
  signIn: '/sign-in',
  signUp: '/sign-up',
  createOrganization: '/create-organization',
  afterSignIn: '/',
  afterSignUp: '/create-organization',
} as const;

export function isAuthRoute(pathname: string) {
  return (
    pathname === AUTH_ROUTES.signIn ||
    pathname.startsWith(`${AUTH_ROUTES.signIn}/`) ||
    pathname === AUTH_ROUTES.signUp ||
    pathname.startsWith(`${AUTH_ROUTES.signUp}/`) ||
    pathname === AUTH_ROUTES.createOrganization ||
    pathname.startsWith(`${AUTH_ROUTES.createOrganization}/`)
  );
}
