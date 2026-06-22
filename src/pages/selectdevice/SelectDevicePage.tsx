import React from "react";
import { Button, Card, Col, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import Page from "../../model/Page";
import { useTranslation } from "react-i18next";
const logoUrl = new URL("../../assets/logo-light.svg", import.meta.url);

const SelectDevicePage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div className="container" style={{ maxWidth: "800px" }}>
            <Row>
                <Col>
                    <Card>
                        <Card.Img variant="top" src="images/dune-weaver.jpg" />
                        <Card.Body style={{ textAlign: "center" }}>
                            <Card.Title>
                                <img
                                    src={logoUrl.toString()}
                                    alt="Dune Weaver"
                                    width={200}
                                />
                            </Card.Title>
                            <Card.Text>
                                {t("page.select-device.fluidnc")}
                            </Card.Text>

                            <Button
                                variant="primary"
                                onClick={() => navigate(Page.FLUIDNC_HOME)}
                            >
                                {t("page.select-device.continue")}
                            </Button>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default SelectDevicePage;
