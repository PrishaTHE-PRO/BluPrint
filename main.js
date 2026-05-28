import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "./firebase.js";

var loginButton = document.getElementById('login-button');
var googleButton = document.getElementById('google-button');

function showToast(message) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(function() {
        toast.classList.remove('show');
    }, 3000);
}

function isValidEmail(email) {
    return email.includes('@') && email.includes('.');
}

function setLoading(isLoading) {
    loginButton.disabled = isLoading;
    googleButton.disabled = isLoading;
    loginButton.textContent = isLoading ? 'Logging in...' : 'Log in';
}

function resetErrors() {
    document.getElementById('email').classList.remove('error');
    document.getElementById('password').classList.remove('error');
    document.getElementById('email-error').style.display = 'none';
    document.getElementById('password-error').style.display = 'none';
}

function getCredentials() {
    var email = document.getElementById('email').value;
    var password = document.getElementById('password').value;

    resetErrors();

    var hasError = false;

    if (!isValidEmail(email)) {
        document.getElementById('email').classList.add('error');
        document.getElementById('email-error').style.display = 'block';
        hasError = true;
    }

    if (password.length < 6) {
        document.getElementById('password').classList.add('error');
        document.getElementById('password-error').style.display = 'block';
        hasError = true;
    }

    if (hasError) return null;

    return { email, password };
}

function getAuthErrorMessage(error) {
    if (!error || !error.code) return 'Something went wrong. Please try again.';

    var messages = {
        'auth/configuration-not-found': 'Firebase Auth is not enabled for this project yet.',
        'auth/email-already-in-use': 'An account already exists for this email.',
        'auth/invalid-credential': 'Email or password is incorrect.',
        'auth/invalid-email': 'Please enter a valid email.',
        'auth/popup-closed-by-user': 'Google sign-in was closed before finishing.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/user-not-found': 'No account was found for this email.',
        'auth/wrong-password': 'Email or password is incorrect.'
    };

    return messages[error.code] || error.message;
}

function ensureConfigured() {
    if (isFirebaseConfigured()) return true;
    showToast('Add your Firebase config in firebase.js first.');
    return false;
}

async function handleLogin() {
    if (!ensureConfigured()) return;

    var credentials = getCredentials();
    if (!credentials) return;

    setLoading(true);

    try {
        await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
        window.location.href = 'dashboard.html';
    } catch (error) {
        showToast(getAuthErrorMessage(error));
    } finally {
        setLoading(false);
    }
}

async function handleSignup(event) {
    event.preventDefault();
    if (!ensureConfigured()) return;

    var credentials = getCredentials();
    if (!credentials) return;

    setLoading(true);

    try {
        await createUserWithEmailAndPassword(auth, credentials.email, credentials.password);
        window.location.href = 'dashboard.html';
    } catch (error) {
        showToast(getAuthErrorMessage(error));
    } finally {
        setLoading(false);
    }
}

async function handleGoogle() {
    if (!ensureConfigured()) return;

    setLoading(true);

    try {
        await signInWithPopup(auth, googleProvider);
        window.location.href = 'dashboard.html';
    } catch (error) {
        showToast(getAuthErrorMessage(error));
    } finally {
        setLoading(false);
    }
}

async function handleForgotPassword(event) {
    event.preventDefault();
    if (!ensureConfigured()) return;

    var email = document.getElementById('email').value;
    resetErrors();

    if (!isValidEmail(email)) {
        document.getElementById('email').classList.add('error');
        document.getElementById('email-error').style.display = 'block';
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        showToast('Password reset email sent.');
    } catch (error) {
        showToast(getAuthErrorMessage(error));
    }
}

onAuthStateChanged(auth, function(user) {
    if (user && isFirebaseConfigured()) {
        window.location.href = 'dashboard.html';
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        handleLogin();
    }
});

document.querySelector('.forgot a').addEventListener('click', handleForgotPassword);

window.handleLogin = handleLogin;
window.handleGoogle = handleGoogle;
window.handleSignup = handleSignup;
