import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  ensureDeviceKeyMaterial,
  getDeviceIdentity,
  setDeviceIdentity,
  clearDeviceAuthorization,
} from "./deviceKey";
import { clearCachedToken } from "./token";
import { publicFetch } from "./api";
import {
  toCreateOptions,
  toGetOptions,
  serializeCreateResponse,
  serializeGetResponse,
} from "./webauthn";
import { useNavigate } from "react-router";

interface User {
  id: string;
  role: string;
  scopes: string[];
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  deviceId: string | null;
  role: string | null;
  displayName: string | null;
  user: User | null;
}

interface AuthContextType extends AuthState {
  loginPasskey: () => Promise<void>;
  loginPassword: (username: string, password: string) => Promise<void>;
  registerPasskey: (username: string) => Promise<void>;
  registerPassword: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

interface FinishResponse {
  user_id: string;
  device_id: string;
  role?: string;
  display_name?: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    userId: null,
    deviceId: null,
    role: null,
    displayName: null,
    user: null,
  });
  const navigate = useNavigate();

  // Check existing device identity on mount
  useEffect(() => {
    getDeviceIdentity()
      .then((identity) => {
        if (identity) {
          setState({
            isAuthenticated: true,
            isLoading: false,
            userId: identity.userId,
            deviceId: identity.deviceId,
            role: "user", // Default role, specific role logic might need API call
            displayName: null,
            user: { id: identity.userId, role: "user", scopes: [] },
          });
        } else {
          setState((s) => ({ ...s, isLoading: false }));
        }
      })
      .catch(() => setState((s) => ({ ...s, isLoading: false })));
  }, []);

  const updateState = (
    userId: string,
    deviceId: string,
    role: string = "user",
    displayName: string | null = null,
  ) => {
    setDeviceIdentity(deviceId, userId);
    setState({
      isAuthenticated: true,
      isLoading: false,
      userId,
      deviceId,
      role,
      displayName,
      user: { id: userId, role, scopes: [] },
    });
  };

  const loginPasskey = useCallback(async () => {
    const keyMaterial = await ensureDeviceKeyMaterial();
    const startRes = await publicFetch<{
      options: Record<string, unknown>;
      flow_id: string;
    }>("/auth/passkey/login/start", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!startRes.ok) throw new Error("Login start failed");

    const getOptions = toGetOptions(
      startRes.data.options as unknown as Parameters<typeof toGetOptions>[0],
    );
    const credential = (await navigator.credentials.get(
      getOptions,
    )) as PublicKeyCredential | null;
    if (!credential) throw new Error("Login cancelled");

    const finishRes = await publicFetch<FinishResponse>(
      "/auth/passkey/login/finish",
      {
        method: "POST",
        body: JSON.stringify({
          flow_id: startRes.data.flow_id,
          credential: serializeGetResponse(credential),
          device_public_key_jwk: keyMaterial.publicJwk,
          device_label: navigator.userAgent.slice(0, 64),
        }),
      },
    );
    if (!finishRes.ok) throw new Error("Login finish failed");

    updateState(
      finishRes.data.user_id,
      finishRes.data.device_id,
      finishRes.data.role,
      finishRes.data.display_name,
    );
  }, []);

  const loginPassword = useCallback(
    async (username: string, password: string) => {
      const keyMaterial = await ensureDeviceKeyMaterial();
      const res = await publicFetch<FinishResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          device_public_key_jwk: keyMaterial.publicJwk,
          device_label: navigator.userAgent.slice(0, 64),
        }),
      });
      if (!res.ok) {
        const error = res.data as { detail?: string };
        throw new Error(error.detail || "Login failed");
      }
      updateState(
        res.data.user_id,
        res.data.device_id,
        res.data.role,
        res.data.display_name,
      );
    },
    [],
  );

  const registerPasskey = useCallback(async (displayName: string) => {
    const keyMaterial = await ensureDeviceKeyMaterial();
    const startRes = await publicFetch<{
      options: Record<string, unknown>;
      flow_id: string;
    }>("/auth/passkey/register/start", {
      method: "POST",
      body: JSON.stringify({ display_name: displayName }),
    });
    if (!startRes.ok) throw new Error("Registration start failed");

    const createOptions = toCreateOptions(
      startRes.data.options as unknown as Parameters<
        typeof toCreateOptions
      >[0],
    );
    const credential = (await navigator.credentials.create(
      createOptions,
    )) as PublicKeyCredential | null;
    if (!credential) throw new Error("Credential creation cancelled");

    const finishRes = await publicFetch<FinishResponse>(
      "/auth/passkey/register/finish",
      {
        method: "POST",
        body: JSON.stringify({
          flow_id: startRes.data.flow_id,
          credential: serializeCreateResponse(credential),
          device_public_key_jwk: keyMaterial.publicJwk,
          device_label: navigator.userAgent.slice(0, 64),
        }),
      },
    );
    if (!finishRes.ok) throw new Error("Registration finish failed");

    updateState(
      finishRes.data.user_id,
      finishRes.data.device_id,
      finishRes.data.role,
      finishRes.data.display_name ?? displayName,
    );
  }, []);

  const registerPassword = useCallback(
    async (username: string, email: string, password: string) => {
      const keyMaterial = await ensureDeviceKeyMaterial();
      const res = await publicFetch<FinishResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username,
          email,
          password,
          device_public_key_jwk: keyMaterial.publicJwk,
          device_label: navigator.userAgent.slice(0, 64),
        }),
      });
      if (!res.ok) {
        const error = res.data as { detail?: string };
        throw new Error(error.detail || "Registration failed");
      }
      updateState(
        res.data.user_id,
        res.data.device_id,
        res.data.role,
        res.data.display_name ?? username,
      );
    },
    [],
  );

  const logout = useCallback(async () => {
    clearCachedToken();
    await clearDeviceAuthorization();
    setState({
      isAuthenticated: false,
      isLoading: false,
      userId: null,
      deviceId: null,
      role: null,
      displayName: null,
      user: null,
    });
    navigate("/");
  }, [navigate]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        loginPasskey,
        loginPassword,
        registerPasskey,
        registerPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
