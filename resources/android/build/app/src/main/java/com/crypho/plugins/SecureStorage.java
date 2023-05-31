package com.crypho.plugins;

import android.annotation.TargetApi;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.Handler;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaArgs;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.lang.reflect.Method;
import java.util.Hashtable;
import java.util.Map;
import java.util.concurrent.Executor;

/**
* CHANGES :
*   31/05/2023 - BLA - Report MR as a workaround for issue #6 (https://github.com/Sotam/cordova-plugin-secure-storage-android10/issues/6)
*                      TODO: remove this file after new release, with this fixed issue
*/
public class SecureStorage extends CordovaPlugin {
    private static final String TAG = "SecureStorage";

    private static final boolean SUPPORTED = Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT;
    private static final Boolean IS_API_29_AVAILABLE = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M;
    private static final Integer DEFAULT_AUTHENTICATION_VALIDITY_TIME = 60 * 60 * 24; // Fallback to 24h. Workaround to avoid asking for credentials too "often"

    private static final String MSG_NOT_SUPPORTED = "API 19 (Android 4.4 KitKat) is required. This device is running API " + Build.VERSION.SDK_INT;
    private static final String MSG_DEVICE_NOT_SECURE = "Device is not secure";
    private static final String MSG_KEYS_FAILED = "Generate RSA Encryption Keys failed. ";

    private Hashtable<String, SharedPreferencesHandler> SERVICE_STORAGE = new Hashtable<String, SharedPreferencesHandler>();
    private String INIT_SERVICE;
    private String INIT_PACKAGENAME;
    private volatile CallbackContext secureDeviceContext, generateKeysContext, unlockCredentialsContext;
    private volatile boolean generateKeysContextRunning = false;

    private AbstractRSA rsa = RSAFactory.getRSA();

    @Override
    public void onResume(boolean multitasking) {
        if (secureDeviceContext != null) {

            if (isDeviceSecure()) {
                secureDeviceContext.success();
            } else {
                secureDeviceContext.error(MSG_DEVICE_NOT_SECURE);
            }
            secureDeviceContext = null;
        }

        if (unlockCredentialsContext != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cordova.getThreadPool().execute(new Runnable() {
                    public void run() {
                        if (unlockCredentialsContext != null) {
                            String alias = service2alias(INIT_SERVICE);
                            if (rsa.userAuthenticationRequired(alias)) {
                                unlockCredentialsContext.error("User not authenticated");
                            }
                            unlockCredentialsContext.success();
                            unlockCredentialsContext = null;
                        }
                    }
                });
            }
        }
    }

    @Override
    public boolean execute(String action, CordovaArgs args, final CallbackContext callbackContext) throws JSONException {
        if (!SUPPORTED) {
            Log.w(TAG, MSG_NOT_SUPPORTED);
            callbackContext.error(MSG_NOT_SUPPORTED);
            return false;
        }
        if ("init".equals(action)) {
            String service = args.getString(0);
            JSONObject options = args.getJSONObject(1);

            String packageName = options.optString("packageName", getContext().getPackageName());

            Context ctx = null;

            // Solves #151. By default, we use our own ApplicationContext
            // If packageName is provided, we try to get the Context of another Application with that packageName
            try {
                ctx = getPackageContext(packageName);
            } catch (Exception e) {
                // This will fail if the application with given packageName is not installed
                // OR if we do not have required permissions and cause a security violation
                Log.e(TAG, "Init failed :", e);
                callbackContext.error(e.getMessage());
            }

            INIT_PACKAGENAME = ctx.getPackageName();
            String alias = service2alias(service);
            INIT_SERVICE = service;

            SharedPreferencesHandler PREFS = new SharedPreferencesHandler(alias, ctx);
            SERVICE_STORAGE.put(service, PREFS);
            if (!isDeviceSecure()) {
                Log.e(TAG, MSG_DEVICE_NOT_SECURE);
                callbackContext.error(MSG_DEVICE_NOT_SECURE);
            } else if (!rsa.encryptionKeysAvailable(alias)) {
                // Encryption Keys aren't available, proceed to generate them
                Integer userAuthenticationValidityDuration = options.optInt("userAuthenticationValidityDuration", DEFAULT_AUTHENTICATION_VALIDITY_TIME);
                generateKeysContext = callbackContext;
                generateEncryptionKeys(userAuthenticationValidityDuration);
                if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.KITKAT) {
                    unlockCredentialsLegacy();
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && rsa.userAuthenticationRequired(alias)) {
                // User has to confirm authentication via device credentials.
                String title = options.optString("unlockCredentialsTitle", null);
                String description = options.optString("unlockCredentialsDescription", null);

                unlockCredentialsContext = callbackContext;
                unlockCredentials(title, description);
            } else {
                initSuccess(callbackContext);
            }

            return true;
        }
        if ("set".equals(action)) {
            final String service = args.getString(0);
            final String key = args.getString(1);
            final String value = args.getString(2);
            final String cipherMode = args.isNull(3) ? null : args.getString(3); // Close #6 - cipherMode is optional
            final String adata = service;
            cordova.getThreadPool().execute(new Runnable() {
                public void run() {
                    try {
                        JSONObject result = AES.encrypt(value.getBytes(), adata.getBytes(), cipherMode);
                        byte[] aes_key = Base64.decode(result.getString("key"), Base64.DEFAULT);
                        byte[] aes_key_enc = rsa.encrypt(aes_key, service2alias(service));
                        result.put("key", Base64.encodeToString(aes_key_enc, Base64.DEFAULT));
                        if (cipherMode != null) result.put("mode", cipherMode);
                        getStorage(service).store(key, result.toString());
                        callbackContext.success(key);
                    } catch (Exception e) {
                        Log.e(TAG, "Encrypt failed :", e);
                        callbackContext.error(e.getMessage());
                    }
                }
            });
            return true;
        }
        if ("get".equals(action)) {
            final String service = args.getString(0);
            final String key = args.getString(1);
            String value = getStorage(service).fetch(key);
            if (value != null) {
                JSONObject json = new JSONObject(value);
                final byte[] encKey = Base64.decode(json.getString("key"), Base64.DEFAULT);
                final JSONObject data = json.getJSONObject("value");
                final byte[] ct = Base64.decode(data.getString("ct"), Base64.DEFAULT);
                final byte[] iv = Base64.decode(data.getString("iv"), Base64.DEFAULT);
                final byte[] adata = Base64.decode(data.getString("adata"), Base64.DEFAULT);
                cordova.getThreadPool().execute(new Runnable() {
                    public void run() {
                        try {
                            byte[] decryptedKey = rsa.decrypt(encKey, service2alias(service));
                            String cipherMode = data.isNull("mode") ? null : data.getString("mode");
                            String decrypted = new String(AES.decrypt(ct, decryptedKey, iv, adata, cipherMode));
                            callbackContext.success(decrypted);
                        } catch (Exception e) {
                            Log.e(TAG, "Decrypt failed :", e);
                            callbackContext.error(e.getMessage());
                        }
                    }
                });
            } else {
                callbackContext.error("Key [" + key + "] not found.");
            }
            return true;
        }
        if ("secureDevice".equals(action)) {
            // Open the Security Settings screen. The app developer should inform the user about
            // the security requirements of the app and initialize again after the user has changed the screen-lock settings
            secureDeviceContext = callbackContext;
            secureDevice();
            return true;
        }
        if ("remove".equals(action)) {
            String service = args.getString(0);
            String key = args.getString(1);
            getStorage(service).remove(key);
            callbackContext.success(key);
            return true;
        }
        if ("keys".equals(action)) {
            String service = args.getString(0);
            callbackContext.success(new JSONArray(getStorage(service).keys()));
            return true;
        }
        if ("clear".equals(action)) {
            String service = args.getString(0);
            getStorage(service).clear();
            callbackContext.success();
            return true;
        }
        return false;
    }

    private boolean isDeviceSecure() {
        KeyguardManager keyguardManager = (KeyguardManager) (getContext().getSystemService(Context.KEYGUARD_SERVICE));
        try {
            Method isSecure = null;
            isSecure = keyguardManager.getClass().getMethod("isDeviceSecure");
            return ((Boolean) isSecure.invoke(keyguardManager)).booleanValue();
        } catch (Exception e) {
            return keyguardManager.isKeyguardSecure();
        }
    }

    private String service2alias(String service) {
        String res = INIT_PACKAGENAME + "." + service;
        return res;
    }

    private SharedPreferencesHandler getStorage(String service) {
        return SERVICE_STORAGE.get(service);
    }

    private void initSuccess(CallbackContext context) {
        context.success();
    }

    /**
     * Create the Confirm Credentials screen.
     * You can customize the title and description or Android will provide a generic one for you if you leave it null
     *
     * @param title
     * @param description
     */
    @TargetApi(Build.VERSION_CODES.LOLLIPOP)
    private void unlockCredentials(final String title, final String description) {
        cordova.getActivity().runOnUiThread(new Runnable() {
            public void run() {
                if (IS_API_29_AVAILABLE && isDeviceSecure()) {
                    // Building a biometric prompt instance with custom title and description.
                    BiometricPrompt.Builder biometricPromptBuilder = new BiometricPrompt.Builder(getContext());
                    biometricPromptBuilder.setTitle(title);
                    biometricPromptBuilder.setDescription(description);
                    //biometricPromptBuilder.setDeviceCredentialAllowed(true);
                    BiometricPrompt biometricPrompt = biometricPromptBuilder.build();
                    CancellationSignal cancellationSignal = new CancellationSignal();
                    final Executor executor = getExecutor();
                    // Launching the credential confirmation popup to get biometric validation.
                    // If biometric is not available will open the other unlock methods.
                    biometricPrompt.authenticate(cancellationSignal, executor, new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationError(int errorCode, CharSequence errString) {
                            super.onAuthenticationError(errorCode, errString);
                        }

                        @Override
                        public void onAuthenticationHelp(int helpCode, CharSequence helpString) {
                            super.onAuthenticationHelp(helpCode, helpString);
                        }

                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            super.onAuthenticationSucceeded(result);
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            super.onAuthenticationFailed();
                        }
                    });
                } else {
                    KeyguardManager keyguardManager = (KeyguardManager) (getContext().getSystemService(Context.KEYGUARD_SERVICE));
                    Intent intent = keyguardManager.createConfirmDeviceCredentialIntent(title, description);
                    if (intent != null) {
                        startActivity(intent);
                    } else {
                        Log.e(TAG, "Error creating Confirm Credentials Intent");
                        unlockCredentialsContext.error("Cant't unlock credentials, error creating Confirm Credentials Intent");
                    }
                }
            }
        });
    }

    @TargetApi(Build.VERSION_CODES.KITKAT)
    private void unlockCredentialsLegacy() {
        cordova.getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Intent intent = new Intent("com.android.credentials.UNLOCK");
                startActivity(intent);
            }
        });
    }

    /**
     * Generate Encryption Keys in the background.
     *
     * @param userAuthenticationValidityDuration User authentication validity duration in seconds
     */
    private void generateEncryptionKeys(final Integer userAuthenticationValidityDuration) {
        if (generateKeysContext != null && !generateKeysContextRunning) {
            cordova.getThreadPool().execute(new Runnable() {
                public void run() {
                    generateKeysContextRunning = true;
                    try {
                        String alias = service2alias(INIT_SERVICE);
                        SharedPreferencesHandler storage = getStorage(INIT_SERVICE);
                        if(storage.isEmpty()){
                            //Solves Issue #96. The RSA key may have been deleted by changing the lock type.
                            getStorage(INIT_SERVICE).clear();
                            rsa.createKeyPair(getContext(), alias, userAuthenticationValidityDuration);
                        }
                        generateKeysContext.success();
                    } catch (Exception e) {
                        Log.e(TAG, MSG_KEYS_FAILED, e);
                        generateKeysContext.error(MSG_KEYS_FAILED + e.getMessage());
                    } finally {
                        generateKeysContext = null;
                        generateKeysContextRunning = false;
                    }
                }
            });
        }
    }

    /**
     * Open Security settings screen.
     */
    private void secureDevice() {
        cordova.getActivity().runOnUiThread(new Runnable() {
            public void run() {
                try {
                    Intent intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
                    startActivity(intent);
                } catch (Exception e) {
                    Log.e(TAG, "Error opening Security settings to secure device : ", e);
                    secureDeviceContext.error(e.getMessage());
                }
            }
        });
    }

    private Context getContext() {
        return cordova.getActivity().getApplicationContext();
    }

    /**
     * Creates a executor with handler to run runnable tasks.
     */
    private Executor getExecutor() {
        return new Executor() {
            @Override
            public void execute(Runnable command) {
                Handler handler = new Handler();
                handler.post(command);
            }
        };
    }

    private Context getPackageContext(String packageName) throws Exception {
        Context pkgContext = null;

        Context context = getContext();
        if (context.getPackageName().equals(packageName)) {
            pkgContext = context;
        } else {
            pkgContext = context.createPackageContext(packageName, 0);
        }

        return pkgContext;
    }

    private void startActivity(Intent intent) {
        cordova.getActivity().startActivity(intent);
    }

}
