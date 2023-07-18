import { ChainInfo } from "@keplr-wallet/types"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"

import {
  ConnectWalletToChainFunction,
  IWalletManagerContext,
  UseWalletResponse,
  WalletConnectionStatus,
} from "../types"
import { getChainInfo, getConnectedWalletInfo } from "../utils"

export const WalletManagerContext = createContext<IWalletManagerContext | null>(
  null
)

export const useWalletManager = () => {
  const context = useContext(WalletManagerContext)
  if (!context) {
    throw new Error("You forgot to use WalletManagerProvider.")
  }

  return context
}

export const useWallet = (
  chainId?: ChainInfo["chainId"]
): UseWalletResponse => {
  const {
    status: managerStatus,
    error: managerError,
    connectedWallet: managerConnectedWallet,
    connectedWallets,
    addConnectedWallet,
    chainInfoOverrides,
    getSigningCosmWasmClientOptions,
    getSigningStargateClientOptions,
  } = useWalletManager()

  // Connect to chain ID if provided when main wallet connection has been
  // established.
  const shouldConnectToChainId =
    managerStatus === WalletConnectionStatus.Connected &&
    !!managerConnectedWallet &&
    !!chainId

  const [chainIdConnecting, setChainIdConnecting] = useState(false)
  const [chainIdError, setChainIdError] = useState<unknown>()
  const chainIdConnectedWallet = shouldConnectToChainId
    ? connectedWallets[chainId]
    : undefined
  useEffect(() => {
    // If should not connect, already connecting, or already connected, do
    // nothing.
    if (
      !shouldConnectToChainId ||
      chainIdConnecting ||
      !!chainIdConnectedWallet
    ) {
      return
    }

    // Try to connect.
    ;(async () => {
      setChainIdConnecting(true)
      setChainIdError(undefined)

      try {
        const chainInfo = await getChainInfo(chainId, chainInfoOverrides)

        // Store connected wallet for chain ID so we can load it from other
        // hooks instantly.
        addConnectedWallet(
          chainId,
          await getConnectedWalletInfo(
            managerConnectedWallet.wallet,
            managerConnectedWallet.walletClient,
            chainInfo,
            await getSigningCosmWasmClientOptions?.(chainInfo),
            await getSigningStargateClientOptions?.(chainInfo)
          )
        )
      } catch (error) {
        console.error(error)
        setChainIdError(error)
      } finally {
        setChainIdConnecting(false)
      }
    })()
  }, [
    managerStatus,
    managerConnectedWallet,
    chainId,
    getSigningCosmWasmClientOptions,
    getSigningStargateClientOptions,
    chainInfoOverrides,
    shouldConnectToChainId,
    addConnectedWallet,
    chainIdConnecting,
    chainIdConnectedWallet,
  ])

  const status = shouldConnectToChainId
    ? // If manager is connected...
      managerStatus === WalletConnectionStatus.Connected
      ? // ...and chain ID wallet is connected,
        chainIdConnectedWallet
        ? // then we're connected.
          WalletConnectionStatus.Connected
        : // ...or chain ID wallet is still connecting or there is no error. Need to check if there is no error because there is one render between the connecting flag being unset and the connected wallets state being updated.
        chainIdConnecting || !chainIdError
        ? // then we're still connecting.
          WalletConnectionStatus.Connecting
        : // ...otherwise we have an error.
          WalletConnectionStatus.ReadyForConnection
      : // otherwise, manager is not connected and we can pass status through.
        managerStatus
    : // If we're not connecting to chain ID, then we can pass status through.
      managerStatus
  const connected = status === WalletConnectionStatus.Connected
  const error = shouldConnectToChainId ? chainIdError : managerError
  const connectedWallet = shouldConnectToChainId
    ? chainIdConnectedWallet
    : managerConnectedWallet

  return { status, connected, error, ...connectedWallet }
}

export const useConnectWalletToChain = () => {
  const {
    status,
    connectedWallet,
    chainInfoOverrides,
    getSigningCosmWasmClientOptions,
    getSigningStargateClientOptions,
  } = useWalletManager()

  const connectWalletToChain: ConnectWalletToChainFunction = useCallback(
    async (chainId) => {
      if (status !== WalletConnectionStatus.Connected || !connectedWallet) {
        throw new Error("Wallet must first be connected to the default chain.")
      }

      const chainInfo = await getChainInfo(chainId, chainInfoOverrides)

      return await getConnectedWalletInfo(
        connectedWallet.wallet,
        connectedWallet.walletClient,
        chainInfo,
        await getSigningCosmWasmClientOptions?.(chainInfo),
        await getSigningStargateClientOptions?.(chainInfo)
      )
    },
    [
      chainInfoOverrides,
      connectedWallet,
      getSigningCosmWasmClientOptions,
      getSigningStargateClientOptions,
      status,
    ]
  )

  return connectWalletToChain
}
