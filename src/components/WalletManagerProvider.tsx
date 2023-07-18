import { SigningCosmWasmClientOptions } from "@cosmjs/cosmwasm-stargate"
import { SigningStargateClientOptions } from "@cosmjs/stargate"
import WalletConnect from "@walletconnect/client"
import { IClientMeta } from "@walletconnect/types"
import React, {
  FunctionComponent,
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  ChainInfoOverrides,
  ConnectedWallet,
  DefaultUiConfig,
  IWalletManagerContext,
  SigningClientGetter,
  UiProps,
  Wallet,
  WalletClient,
  WalletConnectionStatus,
  WalletType,
} from "../types"
import { getChainInfo, getConnectedWalletInfo } from "../utils"
import { WALLETS } from "../wallets"
import { KeplrExtensionWallet } from "../wallets/keplr/extension"
import {
  KeplrWalletConnectV1,
  MANUAL_WALLET_CONNECT_DISCONNECT,
} from "../wallets/keplr/mobile/KeplrWalletConnectV1"
import { DefaultUi } from "./ui/DefaultUi"
import { WalletManagerContext } from "./WalletManagerContext"

export type WalletManagerProviderProps = PropsWithChildren<{
  // Wallet types available for connection.
  enabledWalletTypes: WalletType[]
  // Chain ID to initially connect to and selected by default if nothing is
  // passed to the hook. Must be present in one of the objects in
  // `chainInfoList`.
  defaultChainId: string
  // Optional wallet options for each wallet type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletOptions?: Partial<Record<WalletType, Record<string, any>>>
  // List or getter of additional or replacement ChainInfo objects. These will
  // take precedent over internal definitions by comparing `chainId`.
  chainInfoOverrides?: ChainInfoOverrides
  // Descriptive info about the webapp which gets displayed when enabling a
  // WalletConnect wallet (e.g. name, image, etc.).
  walletConnectClientMeta?: IClientMeta
  // When set to a valid wallet type, the connect function will skip the
  // selection modal and attempt to connect to this wallet immediately.
  preselectedWalletType?: `${WalletType}`
  // localStorage key for saving, loading, and auto connecting to a wallet.
  localStorageKey?: string
  // Callback that will be attached as a listener to the keystore change event
  // on the window object. The event key is determined by the
  // `windowKeystoreRefreshEvent` field in the wallet definition.
  onKeystoreChangeEvent?: (event: Event) => unknown
  // Getter for options passed to SigningCosmWasmClient on connection.
  getSigningCosmWasmClientOptions?: SigningClientGetter<SigningCosmWasmClientOptions>
  // Getter for options passed to SigningStargateClient on connection.
  getSigningStargateClientOptions?: SigningClientGetter<SigningStargateClientOptions>
  // Default UI config.
  defaultUiConfig?: DefaultUiConfig
  // Disables the default UI so a custom UI can be built. UI Props can be
  // retrieved from the `useWalletManager` hook's `uiProps` field. It should
  // contain everything necessary to build a custom UI.
  disableDefaultUi?: boolean
}>

export const WalletManagerProvider: FunctionComponent<
  WalletManagerProviderProps
> = ({
  children,
  enabledWalletTypes,
  walletOptions,
  defaultChainId,
  chainInfoOverrides,
  walletConnectClientMeta,
  preselectedWalletType,
  localStorageKey,
  onKeystoreChangeEvent,
  getSigningCosmWasmClientOptions,
  getSigningStargateClientOptions,
  defaultUiConfig,
  disableDefaultUi,
}) => {
  //! STATE

  const enabledWallets = useMemo(
    () => WALLETS.filter(({ type }) => enabledWalletTypes.includes(type)),
    [enabledWalletTypes]
  )

  const [forceConnectWallet, setForceConnectWallet] = useState<Wallet>()
  const [isEmbeddedKeplrMobileWeb, setIsEmbeddedKeplrMobileWeb] =
    useState(false)

  // Store WalletConnect instance so we can setup a disconnect handler.
  const [walletConnect, setWalletConnect] = useState<WalletConnect>()
  // If set, opens QR code modal.
  const [walletConnectUri, setWalletConnectUri] = useState<string>()
  // Call when closing QR code modal manually to tell WalletConnect the user has
  // cancelled the connection request.
  const onManualQrCloseCallback = useRef<() => void>()

  // Wallet connection state
  // Map chain ID to connected wallet.
  const [connectedWallets, setConnectedWallets] = useState<
    Record<string, ConnectedWallet>
  >({})
  const [error, setError] = useState<unknown>()
  // Once mobile web is checked, we are ready to auto-connect.
  const [status, setStatus] = useState<WalletConnectionStatus>(
    WalletConnectionStatus.Initializing
  )
  // Store wallet we are currently connecting to for UI purposes and to allow
  // manual resetting in case the connection gets stuck. This does not get
  // cleared, so it will be always be set to the most recent wallet a connection
  // attempt was made to.
  const [connectingWallet, setConnectingWallet] = useState<Wallet>()
  const connectionAttemptRef = useRef(0)

  //! CALLBACKS

  // Retrieve chain info for initial wallet connection, throwing error if
  // not found.
  const getDefaultChainInfo = useCallback(
    async () => await getChainInfo(defaultChainId, chainInfoOverrides),
    [defaultChainId, chainInfoOverrides]
  )

  // Disconnect from connected wallet.
  const disconnect = useCallback(() => {
    // Disconnect clients if exist. Log and ignore errors.
    Object.values(connectedWallets).map(({ walletClient }) =>
      walletClient
        ?.disconnect?.()
        ?.catch((err) =>
          console.error("Error disconnecting wallet client", err)
        )
    )

    // Disconnect wallets.
    setConnectedWallets({})
    setStatus(WalletConnectionStatus.ReadyForConnection)

    // Clear WalletConnect state.
    setWalletConnect(undefined)
    setWalletConnectUri(undefined)

    // Remove localStorage value.
    if (localStorageKey) {
      localStorage.removeItem(localStorageKey)
    }
  }, [localStorageKey, connectedWallets])

  // Obtain WalletConnect if necessary, and connect to the wallet.
  const connectToWallet = useCallback(
    async (wallet: Wallet, { autoConnecting = false } = {}) => {
      setStatus(
        autoConnecting
          ? WalletConnectionStatus.AttemptingAutoConnection
          : WalletConnectionStatus.Connecting
      )
      setError(undefined)
      setConnectingWallet(wallet)

      let walletClient: WalletClient | undefined
      let _walletConnect = walletConnect

      // The actual meat of enabling and getting the wallet clients.
      const finalizeWalletConnection = async (newWcSession?: boolean) => {
        const chainInfo = await getDefaultChainInfo()

        walletClient = await wallet.getClient(
          chainInfo,
          _walletConnect,
          walletOptions?.[wallet.type]
        )
        if (!walletClient) {
          throw new Error("Failed to retrieve wallet client.")
        }

        // Prevent double app open request when connecting a new WC session.
        if (walletClient instanceof KeplrWalletConnectV1) {
          walletClient.dontOpenAppOnEnable = !!newWcSession
        }

        // Save connected wallet data. Clears other connected wallets.
        setConnectedWallets({
          [defaultChainId]: await getConnectedWalletInfo(
            wallet,
            walletClient,
            chainInfo,
            await getSigningCosmWasmClientOptions?.(chainInfo),
            await getSigningStargateClientOptions?.(chainInfo)
          ),
        })

        // Allow future WC enable requests to open the app.
        if (walletClient instanceof KeplrWalletConnectV1) {
          walletClient.dontOpenAppOnEnable = false
        }

        // Save localStorage value.
        if (localStorageKey) {
          localStorage.setItem(localStorageKey, wallet.type)
        }

        setStatus(WalletConnectionStatus.Connected)
      }

      try {
        // Connect to WalletConnect if necessary.
        if (wallet.type === WalletType.KeplrMobile) {
          // Instantiate new WalletConnect instance if necessary.
          if (!_walletConnect) {
            _walletConnect = new (
              await import("@walletconnect/client")
            ).default({
              bridge: "https://bridge.walletconnect.org",
              signingMethods: [
                "keplr_enable_wallet_connect_v1",
                "keplr_sign_amino_wallet_connect_v1",
              ],
              qrcodeModal: {
                open: (uri: string, cb: () => void) => {
                  // Open QR modal by setting URI.
                  setWalletConnectUri(uri)
                  onManualQrCloseCallback.current = cb
                },
                close: () => setWalletConnectUri(undefined),
              },
              // clientMeta,
            })
            // clientMeta in constructor is ignored for some reason, so
            // let's set it directly :)))))))))))))
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            _walletConnect._clientMeta = walletConnectClientMeta
            setWalletConnect(_walletConnect)
          }

          if (_walletConnect.connected) {
            // WalletConnect already connected, nothing to do.
            await finalizeWalletConnection()
          } else {
            // Prevent double requests by checking which connection attempt
            // we're on before and after starting the connection attempt.
            const currConnectionAttempt = ++connectionAttemptRef.current

            // Executes walletConnect's qrcodeModal.open.
            await _walletConnect.connect()

            // If another connection attempt is being made, don't try to
            // enable if connect finishes. This prevents double requests.
            if (connectionAttemptRef.current !== currConnectionAttempt) {
              return
            }

            // Connect with new WalletConnect session.
            await finalizeWalletConnection(true)
          }
        } else {
          // No WalletConnect needed.
          await finalizeWalletConnection()
        }
      } catch (err) {
        console.error(err)

        // If QR modal closed, ignore saving error since it is a user action.
        // Otherwise store the error for the UI.
        if (
          // ERROR_QRCODE_MODAL_USER_CLOSED in
          // "@walletconnect/core/dist/esm/errors"
          !(err instanceof Error && err.message === "User close QRCode Modal")
        ) {
          setError(err)
        }

        // If resetting, don't change status. Reset calls `disconnect` to clear
        // state, which will make the WalletConnect `connect` function above
        // throw an error as the connection attempt is interrupted. The status
        // needs to remain `Resetting` in this case.
        setStatus((status) =>
          status === WalletConnectionStatus.Resetting
            ? status
            : WalletConnectionStatus.ReadyForConnection
        )

        // If wallet client was created, disconnect it in case it has a
        // persistent issue being enabled. This prevents getting stuck
        // autoconnecting to a bad wallet.
        walletClient
          ?.disconnect?.()
          ?.catch((err) =>
            console.error(
              "Error disconnecting wallet client on failed connection",
              err
            )
          )
      } finally {
        // Once connection completes, clear WC URI so the QR code stops showing,
        // on both success and failure.
        setWalletConnectUri(undefined)
      }
    },
    [
      walletConnect,
      getDefaultChainInfo,
      walletOptions,
      defaultChainId,
      getSigningCosmWasmClientOptions,
      getSigningStargateClientOptions,
      localStorageKey,
      walletConnectClientMeta,
    ]
  )

  // Begin connection process, either auto-selecting a wallet or opening the
  // selection modal.
  const beginConnection = useCallback(() => {
    // We need to check if we are in the embedded Keplr Mobile web before
    // connecting, since we will force the embedded Keplr wallet if
    // possible. This will only happen if `connect` is called very quickly
    // without waiting for `state` to reach at least
    // `State.AttemptingAutoConnection`, though ideally `connect` is only
    // called once `state` reaches `State.ReadyForConnection`.
    // TODO: Add some docs about this.
    if (status === WalletConnectionStatus.Initializing) {
      throw new Error("Cannot connect while initializing.")
    }

    setError(undefined)

    const automaticWalletType =
      // Auto-connect to preselected wallet.
      preselectedWalletType ||
      // Try to fetch value from localStorage.
      (localStorageKey && localStorage.getItem(localStorageKey)) ||
      undefined

    const skipModalWallet =
      // Mobile web mode takes precedence over automatic wallet.
      isEmbeddedKeplrMobileWeb
        ? KeplrExtensionWallet
        : // Use force connect wallet if present.
        forceConnectWallet
        ? forceConnectWallet
        : // If only one wallet is available, skip the modal and use it.
        enabledWallets.length === 1
        ? enabledWallets[0]
        : // Try to find the wallet to automatically connect to if present.
        automaticWalletType
        ? enabledWallets.find(({ type }) => type === automaticWalletType)
        : undefined

    if (skipModalWallet) {
      connectToWallet(skipModalWallet, {
        autoConnecting:
          status === WalletConnectionStatus.AttemptingAutoConnection,
      })
      return
    }

    // If no default wallet, open modal to choose one.
    setStatus(WalletConnectionStatus.SelectingWallet)
  }, [
    status,
    preselectedWalletType,
    localStorageKey,
    isEmbeddedKeplrMobileWeb,
    forceConnectWallet,
    enabledWallets,
    connectToWallet,
  ])

  // Initiate reset.
  const reset = useCallback(async () => {
    // Disconnect current state.
    disconnect()

    if (connectingWallet) {
      // Set after disconnect, since disconnect sets state to
      // ReadyForConnection. This will trigger the effect to reconnect. This
      // is necessary to ensure that the state that `disconnect` updates is
      // the same state that `connect` reads.
      setStatus(WalletConnectionStatus.Resetting)
    } else {
      // If no wallet to reconnect to, just reload the page.
      window.location.reload()
    }
  }, [connectingWallet, disconnect])

  //! EFFECTS

  // Detect if in embedded Keplr Mobile browser, and set ready after.
  useEffect(() => {
    if (
      status !== WalletConnectionStatus.Initializing ||
      // Only run this on a browser.
      typeof window === "undefined"
    ) {
      return
    }

    const initialize = async () => {
      // Check if in embedded Keplr Mobile web.
      await import("@keplr-wallet/stores")
        .then(({ getKeplrFromWindow }) => getKeplrFromWindow())
        .then(
          (keplr) =>
            keplr &&
            keplr.mode === "mobile-web" &&
            setIsEmbeddedKeplrMobileWeb(true)
        )

      // Check if any wallets should force connect.
      const enabledWalletsShouldForceConnect = await Promise.all(
        enabledWallets.map((w) => w.shouldForceConnect?.())
      )
      setForceConnectWallet(
        enabledWallets.find((_, i) => enabledWalletsShouldForceConnect[i])
      )

      setStatus(WalletConnectionStatus.AttemptingAutoConnection)
    }

    initialize()
  }, [enabledWallets, status])

  // Auto connect on mount handler, after the above mobile web check.
  useEffect(() => {
    if (
      status !== WalletConnectionStatus.AttemptingAutoConnection ||
      // Only run this on a browser.
      typeof localStorage === "undefined"
    ) {
      return
    }

    if (
      // If inside Keplr mobile web, auto connect.
      isEmbeddedKeplrMobileWeb ||
      // If any wallet should force connect, auto connect.
      forceConnectWallet ||
      // If localStorage value present, auto connect.
      (localStorageKey && !!localStorage.getItem(localStorageKey))
    ) {
      beginConnection()
    } else {
      setStatus(WalletConnectionStatus.ReadyForConnection)
    }
  }, [
    status,
    beginConnection,
    isEmbeddedKeplrMobileWeb,
    localStorageKey,
    forceConnectWallet,
  ])

  // Execute onQrCloseCallback if WalletConnect URI is cleared.
  useEffect(() => {
    if (!walletConnectUri) {
      onManualQrCloseCallback.current?.()
      onManualQrCloseCallback.current = undefined
    }
  }, [walletConnectUri])

  // Attempt reconnecting to a wallet after resetting if we have set a wallet to
  // select after resetting.
  useEffect(() => {
    if (status === WalletConnectionStatus.Resetting && connectingWallet) {
      // Updates state to Connecting.
      connectToWallet(connectingWallet)
    }
  }, [connectingWallet, status, connectToWallet])

  // WalletConnect disconnect listener.
  useEffect(() => {
    if (!walletConnect) {
      return
    }

    // Detect disconnected WC session and clear wallet state if this was not a
    // manual disconnect.
    walletConnect.on("disconnect", (_, { params: [{ message }] }) => {
      console.log("WalletConnect disconnected.", message)

      // Only call disconnect if this was not a manual disconnect. The
      // `disconnect` function attempts to disconnect the current wallet, which
      // includes disconnecting any live WalletConnect session, so we don't need
      // to call disconnect again if manual.
      if (message !== MANUAL_WALLET_CONNECT_DISCONNECT) {
        disconnect()
      }
    })

    // Clear listener on unmount.
    return () => walletConnect.off("disconnect")
  }, [disconnect, walletConnect])

  // Keystore change event listener.
  useEffect(() => {
    if (
      // Only run this on a browser.
      typeof window === "undefined"
    ) {
      return
    }

    const windowKeystoreRefreshEvents = Object.values(connectedWallets)
      .map(({ wallet }) => wallet.windowKeystoreRefreshEvent)
      .filter((event): event is string => !!event)
    // Only run this if we are connected to a wallet that has a keystore change
    // event specified.
    if (windowKeystoreRefreshEvents.length === 0) {
      return
    }

    const listener = async (event: Event) => {
      // Reconnect to wallet, since name/address may have changed.
      if (status === WalletConnectionStatus.Connected) {
        connectToWallet(connectedWallets[defaultChainId].wallet)
      }

      // Execute callback if passed.
      onKeystoreChangeEvent?.(event)
    }

    // Add event listeners.
    Array.from(new Set(windowKeystoreRefreshEvents)).map((event) =>
      window.addEventListener(event, listener)
    )

    // Remove event listeners on clean up.
    return () => {
      Array.from(new Set(windowKeystoreRefreshEvents)).map((event) =>
        window.removeEventListener(event, listener)
      )
    }
  }, [
    onKeystoreChangeEvent,
    status,
    connectToWallet,
    connectedWallets,
    defaultChainId,
  ])

  const uiProps = useMemo(
    (): UiProps => ({
      connectToWallet,
      connectedWallet: connectedWallets[defaultChainId],
      connectingWallet,
      defaultUiConfig,
      disconnect,
      error,
      reset,
      status,
      walletConnectUri,
      wallets: enabledWallets,
    }),
    [
      connectToWallet,
      connectedWallets,
      connectingWallet,
      defaultChainId,
      defaultUiConfig,
      disconnect,
      enabledWallets,
      error,
      reset,
      status,
      walletConnectUri,
    ]
  )

  // Memoize context data.
  const value = useMemo(
    (): IWalletManagerContext => ({
      connect: beginConnection,
      disconnect,
      connectedWallet: connectedWallets[defaultChainId],
      connectedWallets,
      addConnectedWallet: (chainId, wallet) =>
        setConnectedWallets((prev) => ({
          ...prev,
          [chainId]: wallet,
        })),
      status,
      connected: status === WalletConnectionStatus.Connected,
      error,
      isEmbeddedKeplrMobileWeb,
      chainInfoOverrides,
      getSigningCosmWasmClientOptions,
      getSigningStargateClientOptions,
      uiProps,
    }),
    [
      beginConnection,
      chainInfoOverrides,
      connectedWallets,
      defaultChainId,
      disconnect,
      error,
      getSigningCosmWasmClientOptions,
      getSigningStargateClientOptions,
      isEmbeddedKeplrMobileWeb,
      status,
      uiProps,
    ]
  )

  return (
    <WalletManagerContext.Provider value={value}>
      {children}

      {!disableDefaultUi && <DefaultUi {...uiProps} />}
    </WalletManagerContext.Provider>
  )
}
