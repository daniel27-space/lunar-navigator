// If a panel fails while drawing, show what happened and a way back, instead of a blank page.
import { Component, type ReactNode } from 'react'

interface Props {
  /** what failed, in a few words, e.g. "The sites panel" */
  what: string
  children: ReactNode
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`${this.props.what} failed:`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="panel empty error-block" role="alert">
        <p>
          <i className="dot danger" /> {this.props.what} hit an error and stopped. The map and the clock still work.
        </p>
        <p className="caption">{this.state.error.message}</p>
        <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    )
  }
}
