import { Component } from "react";
class ErrorBoundaryClass extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    render() {
        if ("error" in this.state) {
            return this.props.fallback(this.state.error);
        }
        return this.props.children;
    }
}
export const ErrorBoundary = ErrorBoundaryClass;
