import { login } from "@lib/data/customer"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import { jitsuTrack, jitsuIdentify } from "@lib/jitsu"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { useActionState, useEffect, useId, useRef } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Login = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(login, null)
  const errorId = useId()
  const hasSubmitted = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  // Track successful login: message is null initially AND on success.
  // We use hasSubmitted to distinguish "not yet submitted" from "success".
  useEffect(() => {
    if (hasSubmitted.current && !message) {
      const loginId = formRef.current?.querySelector<HTMLInputElement>('input[name="email"]')?.value?.trim()
      jitsuTrack("login_completed", {
        method: loginId?.includes("@") ? "email" : "legacy_username",
      })
      if (loginId?.includes("@")) {
        const email = loginId.toLowerCase()
        jitsuIdentify(email, { email })
      }
    }
  }, [message])

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="login-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Welcome back</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Sign in to access an enhanced shopping experience.
      </p>
      <form className="w-full" ref={formRef} action={(formData) => { hasSubmitted.current = true; formAction(formData) }}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Email or username"
            name="email"
            type="text"
            title="Enter your email address or username."
            autoComplete="username"
            aria-describedby={message ? errorId : undefined}
            required
            data-testid="email-input"
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            aria-describedby={message ? errorId : undefined}
            required
            data-testid="password-input"
          />
        </div>
        <ErrorMessage id={errorId} error={message} data-testid="login-error-message" />
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={() => setCurrentView(LOGIN_VIEW.FORGOT_PASSWORD)}
            className="min-h-[44px] inline-flex items-center text-small-regular text-ui-fg-base underline hover:text-Gold transition-colors"
          >
            Forgot password?
          </button>
        </div>
        <SubmitButton data-testid="sign-in-button" className="w-full min-h-[44px] mt-4">
          Sign in
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Not a member?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className="min-h-[44px] min-w-[44px] inline-flex items-center underline"
          data-testid="register-button"
        >
          Join us
        </button>
        .
      </span>
    </div>
  )
}

export default Login
