/**
 * Shared account / registration business-rule helpers for auth APIs.
 */
function accountStatusError(user) {
  if (!user) {
    return {
      status: 404,
      code: 'not_registered',
      message: 'No account for this email. Please sign up first.',
    };
  }
  const status = user.status || 'Active';
  if (status === 'Suspended') {
    return {
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
      message: 'This account has been suspended. Contact support.',
    };
  }
  if (status === 'Rejected') {
    return {
      status: 403,
      code: 'ACCOUNT_REJECTED',
      message: 'This account was rejected. Contact support.',
    };
  }
  if (status !== 'Active') {
    return {
      status: 403,
      code: 'ACCOUNT_INACTIVE',
      message: `Account is not active (status: ${status}).`,
    };
  }
  return null;
}

function isActiveAccount(user) {
  return Boolean(user) && (user.status || 'Active') === 'Active';
}

module.exports = {
  accountStatusError,
  isActiveAccount,
};
