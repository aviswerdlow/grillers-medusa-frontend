const ErrorMessage = ({ error, id, 'data-testid': dataTestid }: { error?: string | null, id?: string, 'data-testid'?: string }) => {
  if (!error || error.startsWith("__SUCCESS__")) {
    return null
  }

  return (
    <div id={id} role="alert" className="pt-2 text-rose-500 text-small-regular" data-testid={dataTestid}>
      <span>{error}</span>
    </div>
  )
}

export default ErrorMessage
