declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string;
              theme?: string;
              size?: string;
              text?: string;
              width?: string;
            }
          ) => void;
        };
      };
    };
  }
}

/**
 * Minimal helper: initialize once and render the Google button.
 * We intentionally avoid One Tap / prompt logic to keep it simple.
 */
export function renderGoogleSignInButton(
  elementId: string,
  clientId: string,
  onSuccess: (idToken: string) => void,
  onError?: (error: string) => void
) {
  if (!window.google?.accounts?.id) {
    onError?.('Google Sign-In script not loaded. Refresh and try again.');
    return;
  }

  const el = document.getElementById(elementId);
  if (!el) {
    onError?.(`Element with id "${elementId}" not found`);
    return;
  }

  el.innerHTML = '';

  try {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) {
          onSuccess(response.credential);
        } else {
          onError?.('No credential returned from Google.');
        }
      },
    });

    window.google.accounts.id.renderButton(el, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: '100%',
    });
  } catch (error) {
    onError?.(`Failed to render Google button: ${error}`);
  }
}
