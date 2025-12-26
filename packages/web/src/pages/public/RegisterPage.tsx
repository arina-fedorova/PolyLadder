import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AxiosError } from 'axios';

const registerSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
    baseLanguage: z.enum(['EN', 'ES', 'PT', 'IT', 'SL'], {
      errorMap: () => ({ message: 'Please select a base language' }),
    }),
    role: z.enum(['learner', 'operator']).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerUser, login } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'learner',
      baseLanguage: 'EN',
    },
  });

  const onSubmit = async (data: RegisterFormData): Promise<void> => {
    setApiError(null);

    try {
      await registerUser({
        email: data.email,
        password: data.password,
        baseLanguage: data.baseLanguage,
        role: data.role,
      });

      const user = await login({ email: data.email, password: data.password });
      if (user?.role === 'operator') {
        void navigate('/operator/dashboard');
      } else {
        void navigate('/dashboard');
      }
    } catch (error) {
      const axiosError = error as AxiosError<{ error: { message: string } }>;
      setApiError(
        axiosError.response?.data?.error?.message || 'Registration failed. Please try again.'
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">PolyLadder</h1>
          <h2 className="mt-6 text-xl text-gray-700">Create your account</h2>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(onSubmit)(e).catch((err: Error) => {
              console.error('Form submission error:', err);
            });
          }}
          className="mt-8 space-y-6 card"
        >
          {apiError && (
            <div
              className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded"
              role="alert"
            >
              {apiError}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              {...register('email')}
              type="email"
              id="email"
              autoComplete="email"
              className="input mt-1"
              placeholder="you@example.com"
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="relative mt-1">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="new-password"
                className="input pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:outline-none z-10"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              At least 8 characters, with uppercase, lowercase, and number
            </p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <div className="relative mt-1">
              <input
                {...register('confirmPassword')}
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                autoComplete="new-password"
                className="input pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 focus:outline-none z-10"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="baseLanguage" className="block text-sm font-medium text-gray-700">
              Base Language (for instructions)
            </label>
            <select {...register('baseLanguage')} id="baseLanguage" className="input mt-1">
              <option value="EN">English</option>
              <option value="ES">Spanish (Español)</option>
              <option value="PT">Portuguese (Português)</option>
              <option value="IT">Italian (Italiano)</option>
              <option value="SL">Slovenian (Slovenščina)</option>
            </select>
            {errors.baseLanguage && (
              <p className="mt-1 text-sm text-red-600">{errors.baseLanguage.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">The language used for UI and explanations</p>
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700">
              Account Type
            </label>
            <select {...register('role')} id="role" className="input mt-1">
              <option value="learner">Learner</option>
              <option value="operator">Operator (Content Reviewer)</option>
            </select>
            {errors.role && <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
